package org.example.backend.watchlist.service;

import org.example.backend.watchlist.alert.PriceAlertIndex;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.exceptions.PriceAlertAlreadyReachedException;
import org.example.backend.watchlist.exceptions.PriceAlertLimitExceededException;
import org.example.backend.watchlist.exceptions.PriceAlertNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistItemNotFoundException;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertWatch;
import org.example.backend.watchlist.model.WatchlistItem;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Setting and clearing the price alert on a watchlist entry. Like every watchlist route, each method starts by
 * checking that the token's user owns the account and the account owns the watchlist; nothing is looked up by an id the
 * client supplied on its own.
 *
 * <p><b>The cap.</b> An account may hold {@code watchlist.limits.max-alerts-per-account} ACTIVE alerts. The count and
 * the write are one statement, and an advisory lock on the account serialises the check across concurrent requests, so
 * the cap cannot be slipped past by racing two requests. Without a cap, one account could fill the table and make every
 * quote's evaluation slower for everybody, on the service that places orders.
 */
@Service
public class PriceAlertService {

    private static final BigDecimal MAX_TARGET = new BigDecimal("1000000000");

    private final WatchlistAccess access;
    private final WatchlistMapper mapper;
    private final WatchlistService watchlistService;
    private final QuoteSource quotes;
    private final PriceAlertIndex index;
    private final int maxAlertsPerAccount;
    private final Clock clock;

    @Autowired
    public PriceAlertService(
            WatchlistAccess access,
            WatchlistMapper mapper,
            WatchlistService watchlistService,
            QuoteSource quotes,
            PriceAlertIndex index,
            @Value("${watchlist.limits.max-alerts-per-account:20}") int maxAlertsPerAccount) {
        this(access, mapper, watchlistService, quotes, index, maxAlertsPerAccount, Clock.systemUTC());
    }

    PriceAlertService(
            WatchlistAccess access,
            WatchlistMapper mapper,
            WatchlistService watchlistService,
            QuoteSource quotes,
            PriceAlertIndex index,
            int maxAlertsPerAccount,
            Clock clock) {
        this.access = access;
        this.mapper = mapper;
        this.watchlistService = watchlistService;
        this.quotes = quotes;
        this.index = index;
        this.maxAlertsPerAccount = maxAlertsPerAccount;
        this.clock = clock;
    }

    @Transactional
    public WatchlistResponse setAlert(
            long userId,
            long accountId,
            long watchlistId,
            String tickerSymbol,
            AlertDirection direction,
            BigDecimal targetPrice) {

        access.assertAccountAccess(userId, accountId);
        access.requireWatchlistForAccount(accountId, watchlistId);
        validateTarget(direction, targetPrice);

        String ticker = requireEntry(watchlistId, tickerSymbol);

        // An alert whose target is already reached would fire the moment it is created: say so instead.
        Quote latest = quotes.latest(List.of(ticker)).get(ticker.toUpperCase(Locale.ROOT));
        if (latest != null && direction.reachedBy(latest.price(), targetPrice)) {
            throw new PriceAlertAlreadyReachedException(ticker);
        }

        mapper.lockAccountForAlerts(accountId);
        int updated = mapper.setAlertIfUnderLimit(
                accountId, watchlistId, ticker, direction, targetPrice, OffsetDateTime.now(clock), maxAlertsPerAccount);
        if (updated == 0) {
            throw new PriceAlertLimitExceededException(accountId, maxAlertsPerAccount);
        }

        afterCommit(() -> index.put(new AlertWatch(watchlistId, ticker, direction, targetPrice)));
        return watchlistService.getWatchlist(userId, accountId, watchlistId);
    }

    @Transactional
    public WatchlistResponse clearAlert(long userId, long accountId, long watchlistId, String tickerSymbol) {
        access.assertAccountAccess(userId, accountId);
        access.requireWatchlistForAccount(accountId, watchlistId);

        String ticker = requireEntry(watchlistId, tickerSymbol);
        if (mapper.clearAlert(watchlistId, ticker) == 0) {
            throw new PriceAlertNotFoundException(watchlistId, ticker);
        }

        afterCommit(() -> index.remove(watchlistId, ticker));
        return watchlistService.getWatchlist(userId, accountId, watchlistId);
    }

    /** The entry's canonical ticker, matched ignoring case, or {@code WLI-404}. */
    private String requireEntry(long watchlistId, String tickerSymbol) {
        if (tickerSymbol == null || tickerSymbol.isBlank() || tickerSymbol.trim().length() > 20) {
            throw new IllegalArgumentException("Ticker symbol is required and cannot exceed 20 characters");
        }
        String wanted = tickerSymbol.trim();
        return mapper.selectWatchlistItems(watchlistId).stream()
                .map(WatchlistItem::getTickerSymbol)
                .filter(ticker -> ticker.equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> new WatchlistItemNotFoundException(watchlistId, wanted));
    }

    private static void validateTarget(AlertDirection direction, BigDecimal targetPrice) {
        if (direction == null) {
            throw new IllegalArgumentException("Direction is required");
        }
        if (targetPrice == null || targetPrice.signum() <= 0) {
            throw new IllegalArgumentException("Target price must be above zero");
        }
        if (targetPrice.stripTrailingZeros().scale() > 4) {
            throw new IllegalArgumentException("Target price can have at most 4 decimal places");
        }
        if (targetPrice.compareTo(MAX_TARGET) > 0) {
            throw new IllegalArgumentException("Target price is too large");
        }
    }

    /**
     * The index mirrors the database, so it changes only once the change is committed: a rolled-back request must not
     * leave an alert armed in memory that is not in the table.
     */
    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
