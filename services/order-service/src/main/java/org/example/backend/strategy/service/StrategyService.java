package org.example.backend.strategy.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.AccountStatus;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.entities.Holding;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.strategy.config.StrategyLimits;
import org.example.backend.strategy.dto.CreateStrategyRequest;
import org.example.backend.strategy.dto.StrategyResponse;
import org.example.backend.strategy.dto.StrategyRunResponse;
import org.example.backend.strategy.exceptions.StrategyAlreadyReachedException;
import org.example.backend.strategy.exceptions.StrategyLimitExceededException;
import org.example.backend.strategy.exceptions.StrategyNotChangeableException;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.NewStrategy;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;

/**
 * What a customer can do with their strategies: create, list, switch off and on, cancel. Each method starts by checking that
 * the token's user owns the account (or the strategy's account); nothing is looked up by an id the client supplied on its own.
 *
 * <p>This service never places an order. Placing one is the executor-service's job, through {@code POST /api/v1/orders},
 * and nothing here can reach it. What this service decides is which strategies exist and in which state, and the state is
 * what the executor reads before every order.
 *
 * <p><b>Switching off is immediate.</b> {@link #setEnabled} is one UPDATE on the strategy row. The executor claims a
 * strategy with an UPDATE on the same row, and the order route holds a shared lock on it while an order is placed, so a
 * switch-off either lands before the claim (no order), waits for an order already being placed, or lands before the order
 * route looks (no order). There is no cycle to wait for.
 */
@Service
public class StrategyService {

    private static final BigDecimal MAX_TRIGGER = new BigDecimal("1000000000");
    private static final int RUNS_SHOWN = 50;

    private final StrategyAccess access;
    private final StrategyMapper strategies;
    private final AccountMapper accounts;
    private final InstrumentMapper instruments;
    private final QuoteSource quotes;
    private final StrategyLimits limits;
    private final HoldingMapper holdings;
    private final CurrencyConversionService fx;
    private final Clock clock;

    @Autowired
    public StrategyService(
            StrategyAccess access,
            StrategyMapper strategies,
            AccountMapper accounts,
            InstrumentMapper instruments,
            QuoteSource quotes,
            StrategyLimits limits,
            HoldingMapper holdings,
            CurrencyConversionService fx) {
        this(access, strategies, accounts, instruments, quotes, limits, holdings, fx, Clock.systemUTC());
    }

    StrategyService(
            StrategyAccess access,
            StrategyMapper strategies,
            AccountMapper accounts,
            InstrumentMapper instruments,
            QuoteSource quotes,
            StrategyLimits limits,
            HoldingMapper holdings,
            CurrencyConversionService fx,
            Clock clock) {
        this.access = access;
        this.strategies = strategies;
        this.accounts = accounts;
        this.instruments = instruments;
        this.quotes = quotes;
        this.limits = limits;
        this.holdings = holdings;
        this.fx = fx;
        this.clock = clock;
    }

    @Transactional
    public StrategyResponse create(long userId, CreateStrategyRequest request) {
        long accountId = request.accountId();
        access.assertAccountAccess(userId, accountId);

        Account account = accounts.selectAccountById(Math.toIntExact(accountId))
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        if (account.getAccountStatus() != AccountStatus.ACTIVE) {
            throw new AccountNotActiveException(accountId, account.getAccountStatus());
        }

        String symbol = request.symbol().trim().toUpperCase(Locale.ROOT);
        Instrument instrument = instruments.selectInstrumentByTicker(symbol)
                .filter(Instrument::isTradable)
                .orElseThrow(() -> new InstrumentNotFoundException(symbol));

        OffsetDateTime now = OffsetDateTime.now(clock);
        BigDecimal maxOrderValue = request.maxOrderValue() != null
                ? request.maxOrderValue()
                : deriveSpendingCap(account, instrument, request);
        long maxPositionQty = request.maxPositionQty() != null
                ? request.maxPositionQty()
                : deriveLargestHolding(account, instrument, request);
        validate(request, maxOrderValue, maxPositionQty, now);

        boolean armed = armedAtCreation(instrument.getInstrumentTicker(), request, now);

        NewStrategy strategy = new NewStrategy(
                accountId,
                instrument.getInstrumentId(),
                request.side(),
                request.quantity(),
                request.direction(),
                request.triggerPrice(),
                armed,
                request.validFrom(),
                request.validUntil(),
                maxOrderValue,
                maxPositionQty,
                request.maxExecutionsOrDefault(),
                request.maxFailuresOrDefault());

        strategies.lockAccountForStrategies(accountId);
        long id = strategies.insertIfUnderLimit(strategy, limits.maxOpenPerAccount())
                .orElseThrow(() -> new StrategyLimitExceededException(accountId, limits.maxOpenPerAccount()));

        return StrategyResponse.from(strategies.selectById(id).orElseThrow());
    }

    public List<StrategyResponse> list(long userId, long accountId) {
        access.assertAccountAccess(userId, accountId);
        return strategies.selectByAccountId(accountId).stream().map(StrategyResponse::from).toList();
    }

    public StrategyResponse get(long userId, long strategyId) {
        return StrategyResponse.from(access.requireOwned(userId, strategyId));
    }

    /**
     * Switches a strategy off or back on. Off applies to a strategy that is ACTIVE or already claimed (EXECUTING), so a
     * customer who switches one off while the executor holds it stops the order if it has not been placed yet. On applies
     * only to a switched-off strategy whose window has not closed, and re-arms it: it waits for a fresh crossing.
     */
    @Transactional
    public StrategyResponse setEnabled(long userId, long strategyId, boolean enabled) {
        Strategy current = access.requireOwned(userId, strategyId);

        if (enabled) {
            if (current.status() == StrategyStatus.ACTIVE) {
                return StrategyResponse.from(current);
            }
            if (current.status() != StrategyStatus.DISABLED || strategies.enable(strategyId) == 0) {
                throw new StrategyNotChangeableException();
            }
        } else {
            if (current.status() == StrategyStatus.DISABLED) {
                return StrategyResponse.from(current);
            }
            if ((current.status() != StrategyStatus.ACTIVE && current.status() != StrategyStatus.EXECUTING)
                    || strategies.disable(strategyId, "Switched off by the customer") == 0) {
                throw new StrategyNotChangeableException();
            }
        }

        return StrategyResponse.from(strategies.selectById(strategyId).orElseThrow());
    }

    @Transactional
    public StrategyResponse cancel(long userId, long strategyId) {
        Strategy current = access.requireOwned(userId, strategyId);

        if (current.status() == StrategyStatus.CANCELLED) {
            return StrategyResponse.from(current);
        }
        if (current.status().isFinal() || strategies.cancel(strategyId, "Cancelled by the customer") == 0) {
            throw new StrategyNotChangeableException();
        }

        return StrategyResponse.from(strategies.selectById(strategyId).orElseThrow());
    }

    public List<StrategyRunResponse> runs(long userId, long strategyId) {
        access.requireOwned(userId, strategyId);
        return strategies.selectRuns(strategyId, RUNS_SHOWN).stream().map(StrategyRunResponse::from).toList();
    }

    /** The spending cap for a customer who sent none: see {@link StrategyLimitDefaults}. */
    private BigDecimal deriveSpendingCap(Account account, Instrument instrument, CreateStrategyRequest request) {
        BigDecimal atTrigger = request.triggerPrice().multiply(BigDecimal.valueOf(request.quantity()));
        BigDecimal inAccountCurrency = fx.convert(atTrigger, instrument.getCurrency(), account.getCurrency());
        return StrategyLimitDefaults.spendingCap(inAccountCurrency, limits);
    }

    /** The largest holding for a customer who sent none: see {@link StrategyLimitDefaults}. */
    private long deriveLargestHolding(Account account, Instrument instrument, CreateStrategyRequest request) {
        long held = holdings
                .selectHoldingByAccountAndInstrument(Math.toIntExact(account.getAccountId()), instrument.getInstrumentId())
                .map(Holding::getQuantity)
                .orElse(0L);
        return StrategyLimitDefaults.largestHolding(
                request.side(), held, request.quantity(), request.maxExecutionsOrDefault(), limits);
    }

    private void validate(CreateStrategyRequest request, BigDecimal maxOrderValue, long maxPositionQty, OffsetDateTime now) {
        if (request.quantity() > limits.maxQuantity()) {
            throw new IllegalArgumentException("Quantity cannot exceed " + limits.maxQuantity());
        }
        if (request.triggerPrice().stripTrailingZeros().scale() > 4) {
            throw new IllegalArgumentException("Trigger price can have at most 4 decimal places");
        }
        if (request.triggerPrice().compareTo(MAX_TRIGGER) > 0) {
            throw new IllegalArgumentException("Trigger price is too large");
        }
        if (maxOrderValue.stripTrailingZeros().scale() > 2) {
            throw new IllegalArgumentException("Maximum order value can have at most 2 decimal places");
        }
        if (maxOrderValue.compareTo(limits.maxOrderValue()) > 0) {
            throw new IllegalArgumentException("Maximum order value cannot exceed " + limits.maxOrderValue().toPlainString());
        }
        if (maxPositionQty > limits.maxPositionQty()) {
            throw new IllegalArgumentException("Maximum position cannot exceed " + limits.maxPositionQty() + " units");
        }
        if (request.side() == org.example.backend.enums.OrderSide.BUY && request.quantity() > maxPositionQty) {
            throw new IllegalArgumentException("Maximum position must be at least the quantity bought");
        }
        if (request.validUntil() != null) {
            if (!request.validUntil().isAfter(now)) {
                throw new IllegalArgumentException("The end of the window must be in the future");
            }
            if (request.validUntil().isAfter(now.plusDays(limits.maxWindowDays()))) {
                throw new IllegalArgumentException(
                        "The end of the window cannot be more than " + limits.maxWindowDays() + " days ahead");
            }
        }
    }

    /**
     * A strategy fires on a crossing, so one whose trigger the price has already reached is refused outright. If the price
     * is known to be on the safe side it is created armed; if no recent price is known it is created un-armed and the
     * executor arms it on the first quote that is on the safe side.
     */
    private boolean armedAtCreation(String ticker, CreateStrategyRequest request, OffsetDateTime now) {
        Quote latest = quotes.latest(List.of(ticker)).get(ticker.toUpperCase(Locale.ROOT));
        if (latest == null) {
            return false;
        }
        if (request.direction().reachedBy(latest.price(), request.triggerPrice())) {
            throw new StrategyAlreadyReachedException(ticker);
        }
        return Duration.between(latest.quotedAt(), now).abs().getSeconds() <= limits.armFreshSeconds();
    }
}
