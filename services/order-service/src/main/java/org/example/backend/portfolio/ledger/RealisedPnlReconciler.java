package org.example.backend.portfolio.ledger;

import org.example.backend.entities.Account;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.portfolio.mapper.PortfolioMapper;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Books any filled sale that is missing from the ledger. The consumer books sales as their events arrive; this catches
 * what it cannot: history from before the consumer existed, a message that was lost, a sale whose event arrived before
 * its order could be read. It runs at start-up and, for one account, whenever that account's portfolio is read.
 *
 * <p>It is safe to run at any time and from several places at once: booking is {@code ON CONFLICT DO NOTHING} on the
 * order id, and the average cost at a sale comes from a deterministic replay of the account's filled orders, so every
 * caller computes the same row.
 *
 * <p>A holding the filled orders do not explain (seeded, or from before orders were recorded) is accounted for as an opening
 * position at the cost its average implies (see {@link AverageCostReplay}), so selling it is booked like any other sale. A
 * sale that nothing can support (the holding is smaller than the orders imply) is not booked and is logged: this never
 * guesses a cost.
 */
@Component
public class RealisedPnlReconciler {

    private static final Logger LOGGER = LoggerFactory.getLogger(RealisedPnlReconciler.class);

    private final PortfolioMapper mapper;
    private final RealisedPnlLedger ledger;
    private final AccountMapper accountMapper;

    public RealisedPnlReconciler(PortfolioMapper mapper, RealisedPnlLedger ledger, AccountMapper accountMapper) {
        this.mapper = mapper;
        this.ledger = ledger;
        this.accountMapper = accountMapper;
    }

    /** @return how many sales this call booked (0 when the ledger was already complete) */
    public int reconcileAccount(long accountId) {
        // One cheap count first: the common case is "nothing to do", and that must not replay the account's history.
        if (mapper.countUnbookedSales(accountId) == 0) {
            return 0;
        }

        Optional<Account> account = accountMapper.selectAccountById(Math.toIntExact(accountId));
        if (account.isEmpty()) {
            return 0;
        }

        List<FilledOrder> filled = mapper.selectFilledOrders(accountId);
        Map<String, HoldingSnapshot> holdings = new HashMap<>();
        for (HoldingSnapshot holding : mapper.selectHoldings(accountId)) {
            holdings.put(holding.tickerSymbol().toUpperCase(Locale.ROOT), holding);
        }
        AverageCostReplay.Result result = AverageCostReplay.replay(filled, holdings);

        int booked = 0;
        for (AverageCostReplay.Sale sale : result.sales()) {
            if (ledger.book(accountId, account.get().getCurrency(), sale)) {
                booked++;
            }
        }
        for (Long orderId : result.unreconcilable()) {
            LOGGER.warn("Sale {} on account {} is not supported by the account's orders or its holding: realised profit and loss not booked",
                    orderId, accountId);
        }
        return booked;
    }

    /** Every account with an unbooked sale. A failure on one account is logged and does not stop the others. */
    public int reconcileAll() {
        int booked = 0;
        for (Long accountId : mapper.selectAccountsWithUnbookedSales()) {
            try {
                booked += reconcileAccount(accountId);
            } catch (RuntimeException ex) {
                LOGGER.warn("Could not reconcile realised profit and loss for account {}", accountId, ex);
            }
        }
        return booked;
    }
}
