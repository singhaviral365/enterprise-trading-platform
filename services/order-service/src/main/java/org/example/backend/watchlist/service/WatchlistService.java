package org.example.backend.watchlist.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.watchlist.dto.PriceAlertResponse;
import org.example.backend.watchlist.dto.WatchlistItemResponse;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.exceptions.WatchlistItemAlreadyExistsException;
import org.example.backend.watchlist.exceptions.WatchlistItemLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistItemNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistLimitExceededException;
import org.example.backend.watchlist.exceptions.WatchlistNameConflictException;
import org.example.backend.watchlist.exceptions.WatchlistNotFoundException;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.Watchlist;
import org.example.backend.watchlist.model.WatchlistItem;
import org.example.backend.watchlist.price.PriceView;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.example.backend.watchlist.price.WatchlistPricing;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Watchlist use cases. Every public method starts with {@link #assertAccountAccess}: the account in
 * the verified token must own the account being addressed, and every lookup after that is scoped to
 * that account, never to an identifier the client supplied on its own.
 *
 * <p>Prices are never stored in a database. They are read from the in-memory quote source that the
 * market-data consumer fills, once the database reads are done. Each write below is a single
 * statement, so none needs a transaction.
 */
@Service
public class WatchlistService {

    private final WatchlistMapper watchlistMapper;
    private final AccountMapper accountMapper;
    private final WatchlistPricing pricing;
    private final QuoteSource quoteSource;
    private final int maxWatchlistsPerAccount;
    private final int maxItemsPerWatchlist;

    public WatchlistService(
            WatchlistMapper watchlistMapper,
            AccountMapper accountMapper,
            WatchlistPricing pricing,
            QuoteSource quoteSource,
            @Value("${watchlist.limits.max-watchlists-per-account:10}") int maxWatchlistsPerAccount,
            @Value("${watchlist.limits.max-items-per-watchlist:50}") int maxItemsPerWatchlist) {

        this.watchlistMapper = watchlistMapper;
        this.accountMapper = accountMapper;
        this.pricing = pricing;
        this.quoteSource = quoteSource;
        this.maxWatchlistsPerAccount = maxWatchlistsPerAccount;
        this.maxItemsPerWatchlist = maxItemsPerWatchlist;
    }

    @Transactional
    public WatchlistResponse createWatchlist(
            long userId,
            long accountId,
            String requestedName) {

        assertAccountAccess(userId, accountId);
        String name = normalizeName(requestedName);

        if (watchlistMapper.selectWatchlistByAccountIdAndName(accountId, name).isPresent()) {
            throw new WatchlistNameConflictException(accountId, name);
        }

        long watchlistId = watchlistMapper.nextWatchlistId();
        OffsetDateTime now = OffsetDateTime.now();
        Watchlist watchlist = new Watchlist(watchlistId, accountId, name, now, now);

        int inserted;
        try {
            inserted = watchlistMapper.insertWatchlistIfUnderLimit(watchlist, maxWatchlistsPerAccount);
        } catch (DuplicateKeyException ex) {
            // Two requests with the same name raced past the check above; the unique constraint decided.
            throw new WatchlistNameConflictException(accountId, name);
        }

        if (inserted == 0) {
            throw new WatchlistLimitExceededException(accountId, maxWatchlistsPerAccount);
        }

        return toResponse(watchlist, List.of());
    }

    public List<WatchlistResponse> listWatchlists(
            long userId,
            long accountId) {

        assertAccountAccess(userId, accountId);

        // However many watchlists the account has: one query for the lists, one for all their
        // items, and one lookup for the latest price of every symbol on the page.
        List<WatchlistItem> allItems = watchlistMapper.selectItemsByAccountId(accountId);
        List<WatchlistItemResponse> pricedItems = toItemResponses(allItems);

        Map<Long, List<WatchlistItemResponse>> itemsByWatchlist = new HashMap<>();
        for (int i = 0; i < allItems.size(); i++) {
            itemsByWatchlist
                    .computeIfAbsent(allItems.get(i).getWatchlistId(), id -> new ArrayList<>())
                    .add(pricedItems.get(i));
        }

        return watchlistMapper.selectWatchlistsByAccountId(accountId)
                .stream()
                .map(watchlist -> toResponse(
                        watchlist,
                        itemsByWatchlist.getOrDefault(watchlist.getWatchlistId(), List.of())))
                .toList();
    }

    /** One watchlist with its entries, prices and alerts. Used to answer a change to one of its entries. */
    public WatchlistResponse getWatchlist(long userId, long accountId, long watchlistId) {
        assertAccountAccess(userId, accountId);
        Watchlist watchlist = requireWatchlistForAccount(accountId, watchlistId);
        return toResponse(watchlist, toItemResponses(watchlistMapper.selectWatchlistItems(watchlistId)));
    }

    public WatchlistResponse renameWatchlist(
            long userId,
            long accountId,
            long watchlistId,
            String requestedName) {

        assertAccountAccess(userId, accountId);

        Watchlist watchlist = requireWatchlistForAccount(accountId, watchlistId);
        String name = normalizeName(requestedName);

        watchlistMapper.selectWatchlistByAccountIdAndName(accountId, name)
                .filter(existing -> existing.getWatchlistId() != watchlistId)
                .ifPresent(existing -> {
                    throw new WatchlistNameConflictException(accountId, name);
                });

        try {
            watchlistMapper.updateWatchlistName(watchlistId, name);
        } catch (DuplicateKeyException ex) {
            throw new WatchlistNameConflictException(accountId, name);
        }

        Watchlist renamed = new Watchlist(
                watchlist.getWatchlistId(),
                watchlist.getAccountId(),
                name,
                watchlist.getCreatedAt(),
                OffsetDateTime.now());

        return toResponse(renamed, toItemResponses(watchlistMapper.selectWatchlistItems(watchlistId)));
    }

    @Transactional
    public void deleteWatchlist(
            long userId,
            long accountId,
            long watchlistId) {

        assertAccountAccess(userId, accountId);
        requireWatchlistForAccount(accountId, watchlistId);
        watchlistMapper.deleteWatchlist(watchlistId);
    }

    public WatchlistResponse addStock(
            long userId,
            long accountId,
            long watchlistId,
            String tickerSymbol) {

        assertAccountAccess(userId, accountId);
        Watchlist watchlist = requireWatchlistForAccount(accountId, watchlistId);

        // The instrument may be one the customer has never traded; it only has to exist and be tradable.
        String requested = normalizeTicker(tickerSymbol);
        String ticker = watchlistMapper.selectTradableTicker(requested)
                .orElseThrow(() -> new InstrumentNotFoundException(requested));

        if (watchlistMapper.watchlistItemExists(watchlistId, ticker)) {
            throw new WatchlistItemAlreadyExistsException(watchlistId, ticker);
        }

        int inserted;
        try {
            inserted = watchlistMapper.insertWatchlistItemIfUnderLimit(
                    new WatchlistItem(watchlistId, ticker, OffsetDateTime.now()),
                    maxItemsPerWatchlist);
        } catch (DuplicateKeyException ex) {
            throw new WatchlistItemAlreadyExistsException(watchlistId, ticker);
        }

        if (inserted == 0) {
            throw new WatchlistItemLimitExceededException(watchlistId, maxItemsPerWatchlist);
        }

        return toResponse(watchlist, toItemResponses(watchlistMapper.selectWatchlistItems(watchlistId)));
    }

    public WatchlistResponse removeStock(
            long userId,
            long accountId,
            long watchlistId,
            String tickerSymbol) {

        assertAccountAccess(userId, accountId);
        Watchlist watchlist = requireWatchlistForAccount(accountId, watchlistId);

        String ticker = normalizeTicker(tickerSymbol);
        int deleted = watchlistMapper.deleteWatchlistItem(watchlistId, ticker);
        if (deleted == 0) {
            throw new WatchlistItemNotFoundException(watchlistId, ticker);
        }

        return toResponse(watchlist, toItemResponses(watchlistMapper.selectWatchlistItems(watchlistId)));
    }

    /**
     * The verified token's user must own the addressed account. A mismatch is {@code ACC-403}; an
     * unknown account is {@code ACC-404}, as on the platform's other account routes.
     */
    private void assertAccountAccess(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);

        if (!accountMapper.accountExists(accountIdInt)) {
            throw new AccountNotFoundException(accountId);
        }

        Integer linkedUserId = accountMapper.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new WatchlistAccessDeniedException(accountId);
        }
    }

    /**
     * A watchlist that exists but belongs to another account is reported as not found, so the
     * response does not reveal which watchlist ids are in use.
     */
    private Watchlist requireWatchlistForAccount(long accountId, long watchlistId) {
        Watchlist watchlist = watchlistMapper.selectWatchlistById(watchlistId)
                .orElseThrow(() -> new WatchlistNotFoundException(watchlistId));

        if (watchlist.getAccountId() != accountId) {
            throw new WatchlistNotFoundException(watchlistId);
        }

        return watchlist;
    }

    private static String normalizeName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Watchlist name is required");
        }

        String normalized = name.trim();
        if (normalized.length() > 100) {
            throw new IllegalArgumentException("Watchlist name cannot exceed 100 characters");
        }

        return normalized;
    }

    private static String normalizeTicker(String tickerSymbol) {
        if (tickerSymbol == null || tickerSymbol.isBlank()) {
            throw new IllegalArgumentException("Ticker symbol is required");
        }

        String normalized = tickerSymbol.trim();
        if (normalized.length() > 20) {
            throw new IllegalArgumentException("Ticker symbol cannot exceed 20 characters");
        }

        return normalized;
    }

    private static WatchlistResponse toResponse(
            Watchlist watchlist,
            List<WatchlistItemResponse> items) {

        return new WatchlistResponse(
                watchlist.getWatchlistId(),
                watchlist.getAccountId(),
                watchlist.getName(),
                watchlist.getCreatedAt(),
                watchlist.getUpdatedAt(),
                items);
    }

    private List<WatchlistItemResponse> toItemResponses(List<WatchlistItem> items) {
        Map<String, Quote> quotes = latestQuotes(items);

        return items.stream()
                .map(item -> {
                    PriceView price = pricing.viewOf(quotes.get(key(item.getTickerSymbol())));
                    return new WatchlistItemResponse(
                            item.getTickerSymbol(),
                            item.getAddedAt(),
                            price.price(),
                            price.quotedAt(),
                            price.status(),
                            PriceAlertResponse.from(item.getAlert()));
                })
                .toList();
    }

    /** One lookup for every symbol being shown. A symbol with no quote is simply absent. */
    private Map<String, Quote> latestQuotes(List<WatchlistItem> items) {
        List<String> symbols = items.stream()
                .map(WatchlistItem::getTickerSymbol)
                .distinct()
                .toList();

        if (symbols.isEmpty()) {
            return Map.of();
        }

        return quoteSource.latest(symbols);
    }

    private static String key(String symbol) {
        return symbol.trim().toUpperCase(Locale.ROOT);
    }
}
