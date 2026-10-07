package org.example.trade_executor.strategy;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.trade_executor.fx.CurrencyConversionService;
import org.example.trade_executor.fx.ExchangeRateUnavailableException;
import org.example.trade_executor.strategy.OrderApiClient.Duplicate;
import org.example.trade_executor.strategy.OrderApiClient.Placed;
import org.example.trade_executor.strategy.OrderApiClient.Refused;
import org.example.trade_executor.strategy.OrderApiClient.Result;
import org.example.trade_executor.strategy.OrderApiClient.Unavailable;
import org.example.trade_executor.strategy.config.StrategySettings;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.RunOutcome;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * What happens for each quote, for each strategy waiting on that instrument. This is the whole of the decision to trade, so
 * it is deliberately a straight line of small steps, each of which can only stop it:
 *
 * <ol>
 *   <li>the kill switch, then the strategies read fresh from the table (never a cache: a cache would hide a switch-off);</li>
 *   <li>the trigger: an un-armed strategy is armed by a quote on the safe side and never fires on any quote; an armed one
 *       fires only on a quote that satisfies its condition, is not too old, and falls in its window;</li>
 *   <li><b>the claim</b>: one UPDATE that succeeds only if the strategy is still ACTIVE. This is the gate. A strategy the
 *       customer switched off, cancelled, or that another worker already claimed, is not claimed and nothing happens;</li>
 *   <li>the limits, read fresh, before any order exists: the most it may spend, the largest position it may build, the
 *       holding it needs to sell;</li>
 *   <li>a token for the owner, and a last look that the claim is still held, so a switch-off during the steps above still
 *       stops the order;</li>
 *   <li>the order, through {@code POST /api/v1/orders}, whose key is the same for every retry of the run;</li>
 *   <li>what happened, written down with the strategy's new state in one transaction.</li>
 * </ol>
 *
 * Whatever goes wrong after the claim is counted as a failure and the claim is given back; a strategy that fails
 * {@code max_failures} times in a row is stopped. One strategy's problem never stops the others on the same quote.
 */
@Component
public class StrategyWorker {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyWorker.class);

    private final StrategyMapper strategies;
    private final StrategyRunRecorder recorder;
    private final AccountMapper accounts;
    private final HoldingMapper holdings;
    private final CurrencyConversionService currencies;
    private final ExecutorTokenMinter tokens;
    private final OrderApiClient orderApi;
    private final StrategySettings settings;
    private final Clock clock;

    @Autowired
    public StrategyWorker(
            StrategyMapper strategies,
            StrategyRunRecorder recorder,
            AccountMapper accounts,
            HoldingMapper holdings,
            CurrencyConversionService currencies,
            ExecutorTokenMinter tokens,
            OrderApiClient orderApi,
            StrategySettings settings) {
        this(strategies, recorder, accounts, holdings, currencies, tokens, orderApi, settings, Clock.systemUTC());
    }

    StrategyWorker(
            StrategyMapper strategies,
            StrategyRunRecorder recorder,
            AccountMapper accounts,
            HoldingMapper holdings,
            CurrencyConversionService currencies,
            ExecutorTokenMinter tokens,
            OrderApiClient orderApi,
            StrategySettings settings,
            Clock clock) {
        this.strategies = strategies;
        this.recorder = recorder;
        this.accounts = accounts;
        this.holdings = holdings;
        this.currencies = currencies;
        this.tokens = tokens;
        this.orderApi = orderApi;
        this.settings = settings;
        this.clock = clock;
    }

    public void onQuote(StrategyQuote quote) {
        if (!settings.enabled()) {
            LOGGER.debug("Strategy execution is switched off; ignoring the {} quote", quote.symbol());
            return;
        }

        List<RunnableStrategy> waiting = strategies.selectActiveForTicker(quote.symbol());
        for (RunnableStrategy strategy : waiting) {
            try {
                handle(strategy, quote);
            } catch (RuntimeException ex) {
                // Before the claim there is nothing to give back; after it, handle() has already done so.
                LOGGER.error("Strategy {} could not be evaluated for the {} quote", strategy.strategyId(), quote.symbol(), ex);
            }
        }
    }

    private void handle(RunnableStrategy strategy, StrategyQuote quote) {
        boolean reached = strategy.direction().reachedBy(quote.price(), strategy.triggerPrice());

        if (!strategy.armed()) {
            // A crossing needs the price to have been on the safe side first. This quote may arm it; it never fires it.
            if (!reached) {
                strategies.arm(strategy.strategyId());
            }
            return;
        }
        if (!reached) {
            return;
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        if (outsideWindow(strategy, now)) {
            return;
        }
        if (Duration.between(quote.quotedAt(), now).compareTo(settings.maxQuoteAge()) > 0) {
            recorder.stale(strategy, quote);
            return;
        }
        if (!tokens.isConfigured()) {
            LOGGER.warn("Strategy {} was triggered but the token secret is not configured; nothing is claimed",
                    strategy.strategyId());
            return;
        }

        Optional<Account> account = accounts.selectAccountById(strategy.accountId());
        if (account.isEmpty() || account.get().getAccountStatus() != AccountStatus.ACTIVE) {
            LOGGER.info("Strategy {} was triggered but its account is not active; left as it is", strategy.strategyId());
            return;
        }

        // The gate. From here the strategy is ours until we give it back.
        if (strategies.claim(strategy.strategyId()) == 0) {
            LOGGER.info("Strategy {} was triggered but could not be claimed (switched off, claimed, or finished)",
                    strategy.strategyId());
            return;
        }

        try {
            run(strategy, quote, account.get());
        } catch (RuntimeException ex) {
            LOGGER.error("Strategy {} failed after being claimed", strategy.strategyId(), ex);
            giveBackAsFailure(strategy, quote, RunOutcome.API_ERROR, "An unexpected error stopped this run");
        }
    }

    /** Everything that happens while the claim is held. */
    private void run(RunnableStrategy strategy, StrategyQuote quote, Account account) {
        pauseForDemonstration(strategy);

        Optional<String> breach;
        try {
            breach = limitBreach(strategy, quote.price(), account);
        } catch (ExchangeRateUnavailableException ex) {
            giveBackAsFailure(strategy, quote, RunOutcome.API_ERROR, "The exchange rate was not available");
            return;
        }
        if (breach.isPresent()) {
            giveBackAsFailure(strategy, quote, RunOutcome.BLOCKED_LIMIT, breach.get());
            return;
        }

        String token = tokens.mint(strategy.ownerUserId(), strategy.strategyId());

        // The last look before the order leaves. A switch-off during the checks above lands here and stops the order.
        if (strategies.confirmClaim(strategy.strategyId()) == 0) {
            recorder.disabledBeforeSend(strategy, quote);
            LOGGER.info("Strategy {} was switched off before its order was sent; no order placed", strategy.strategyId());
            return;
        }

        Result result = orderApi.placeMarketOrder(strategy, token);
        switch (result) {
            case Placed placed -> {
                recorder.ordered(strategy, quote, placed.orderId(), false);
                LOGGER.info("Strategy {} placed order {} (run {})", strategy.strategyId(), placed.orderId(), strategy.runNumber());
            }
            case Duplicate ignored -> {
                Optional<ExistingOrder> existing = strategies.selectOrderByKey(strategy.orderKey());
                if (existing.isPresent()) {
                    recorder.ordered(strategy, quote, existing.get().orderId(), true);
                    LOGGER.info("Strategy {} had already placed order {} (run {})",
                            strategy.strategyId(), existing.get().orderId(), strategy.runNumber());
                } else {
                    giveBackAsFailure(strategy, quote, RunOutcome.API_ERROR, "The order route reported a duplicate that was not found");
                }
            }
            case Refused refused -> giveBackAsFailure(strategy, quote, RunOutcome.REJECTED,
                    "The order was refused (HTTP " + refused.status() + (refused.errorCode() == null ? "" : " " + refused.errorCode()) + ")");
            case Unavailable unavailable -> giveBackAsFailure(strategy, quote, RunOutcome.API_ERROR,
                    "The order was not placed: " + unavailable.detail());
        }
    }

    /**
     * The checks that bound the damage, made with fresh reads at the point of decision. The customer's own limits, not the
     * order route's: the route checks funds only when the order settles, so it cannot be the cap on what a strategy spends.
     *
     * @return why the order must not be placed, or empty if every limit allows it
     */
    Optional<String> limitBreach(RunnableStrategy strategy, BigDecimal price, Account account) {
        BigDecimal accountPrice = currencies.convert(price, strategy.instrumentCurrency(), account.getCurrency());
        BigDecimal orderValue = accountPrice
                .multiply(BigDecimal.valueOf(strategy.quantity()))
                .setScale(2, RoundingMode.HALF_UP);

        if (orderValue.compareTo(strategy.maxOrderValue()) > 0) {
            return Optional.of("The order would cost " + orderValue.toPlainString() + " " + account.getCurrency()
                    + ", over the limit of " + strategy.maxOrderValue().toPlainString());
        }

        long held = holdings.selectHoldingByAccountAndInstrument(strategy.accountId(), strategy.instrumentId())
                .map(Holding::getQuantity)
                .orElse(0L);

        if (strategy.side() == OrderSide.BUY) {
            long after = held + strategy.quantity();
            if (after > strategy.maxPositionQty()) {
                return Optional.of("The position would be " + after + " units, over the limit of " + strategy.maxPositionQty());
            }
        } else if (held < strategy.quantity()) {
            return Optional.of("The holding of " + held + " units is smaller than the " + strategy.quantity() + " to sell");
        }
        return Optional.empty();
    }

    private void giveBackAsFailure(RunnableStrategy strategy, StrategyQuote quote, RunOutcome outcome, String detail) {
        try {
            recorder.failed(strategy, quote, outcome, detail);
        } catch (RuntimeException ex) {
            // Left EXECUTING, the sweeper gives the claim back after its timeout.
            LOGGER.error("Could not record the failure of strategy {}; the sweeper will release it", strategy.strategyId(), ex);
        }
    }

    private static boolean outsideWindow(RunnableStrategy strategy, OffsetDateTime now) {
        return (strategy.validFrom() != null && now.isBefore(strategy.validFrom()))
                || (strategy.validUntil() != null && !now.isBefore(strategy.validUntil()));
    }

    /** Development only: holds the claim for a while so a switch-off can be shown landing in the middle of a run. */
    private void pauseForDemonstration(RunnableStrategy strategy) {
        long millis = settings.demoDelayMillis();
        if (millis <= 0) {
            return;
        }
        LOGGER.warn("DEMONSTRATION: holding the claim on strategy {} for {} ms before its order is sent",
                strategy.strategyId(), millis);
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
