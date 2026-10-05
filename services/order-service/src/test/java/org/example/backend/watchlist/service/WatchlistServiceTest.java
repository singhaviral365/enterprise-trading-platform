package org.example.backend.watchlist.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
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
import org.example.backend.watchlist.price.PriceStatus;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.example.backend.watchlist.price.WatchlistPricing;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WatchlistServiceTest {

    private static final int MAX_WATCHLISTS = 10;
    private static final int MAX_ITEMS = 50;
    private static final Instant NOW = Instant.parse("2026-01-10T10:00:00Z");

    @Mock
    private WatchlistMapper watchlistMapper;

    @Mock
    private AccountMapper accountMapper;

    @Mock
    private QuoteSource quoteSource;

    private WatchlistService watchlistService;

    @BeforeEach
    void setUp() {
        WatchlistPricing pricing = new WatchlistPricing(300, Clock.fixed(NOW, ZoneOffset.UTC));
        watchlistService = new WatchlistService(
                watchlistMapper, accountMapper, pricing, quoteSource, MAX_WATCHLISTS, MAX_ITEMS);
    }

    // ---- a watchlist is created and scoped to the authenticated account ----

    @Test
    void createWatchlistIsScopedToTheAddressedAccount() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "Long Term")).thenReturn(Optional.empty());
        when(watchlistMapper.nextWatchlistId()).thenReturn(10L);
        when(watchlistMapper.insertWatchlistIfUnderLimit(any(Watchlist.class), anyInt())).thenReturn(1);

        WatchlistResponse response = watchlistService.createWatchlist(55L, 100L, "  Long Term  ");

        assertEquals(10L, response.watchlistId());
        assertEquals(100L, response.accountId());
        assertEquals("Long Term", response.name());
        assertEquals(0, response.items().size());

        ArgumentCaptor<Watchlist> saved = ArgumentCaptor.forClass(Watchlist.class);
        verify(watchlistMapper).insertWatchlistIfUnderLimit(saved.capture(), org.mockito.ArgumentMatchers.eq(MAX_WATCHLISTS));
        assertEquals(100L, saved.getValue().getAccountId());
    }

    @Test
    void createWatchlistRefusesAnAccountThatIsNotTheCallers() {
        when(accountMapper.accountExists(100)).thenReturn(true);
        when(accountMapper.selectAccountLinkedUserId(100)).thenReturn(99);

        assertThrows(
                WatchlistAccessDeniedException.class,
                () -> watchlistService.createWatchlist(55L, 100L, "Core"));

        verify(watchlistMapper, never()).insertWatchlistIfUnderLimit(any(), anyInt());
    }

    @Test
    void createWatchlistRejectsDuplicateName() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "Growth"))
                .thenReturn(Optional.of(sampleWatchlist(11L, 100L, "Growth")));

        assertThrows(
                WatchlistNameConflictException.class,
                () -> watchlistService.createWatchlist(55L, 100L, "Growth"));

        verify(watchlistMapper, never()).insertWatchlistIfUnderLimit(any(), anyInt());
    }

    @Test
    void createWatchlistReportsNameConflictWhenTwoRequestsRace() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "Growth")).thenReturn(Optional.empty());
        when(watchlistMapper.nextWatchlistId()).thenReturn(12L);
        when(watchlistMapper.insertWatchlistIfUnderLimit(any(Watchlist.class), anyInt()))
                .thenThrow(new DuplicateKeyException("uq_watchlist_account_name"));

        assertThrows(
                WatchlistNameConflictException.class,
                () -> watchlistService.createWatchlist(55L, 100L, "Growth"));
    }

    // ---- alert/watchlist creation is capped per account ----

    @Test
    void createWatchlistIsRefusedWhenTheAccountIsAtItsCap() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "Eleventh")).thenReturn(Optional.empty());
        when(watchlistMapper.nextWatchlistId()).thenReturn(13L);
        when(watchlistMapper.insertWatchlistIfUnderLimit(any(Watchlist.class), anyInt())).thenReturn(0);

        WatchlistLimitExceededException ex = assertThrows(
                WatchlistLimitExceededException.class,
                () -> watchlistService.createWatchlist(55L, 100L, "Eleventh"));

        assertEquals("WTL-422", ex.getErrorCode());
        assertEquals(MAX_WATCHLISTS, ex.getLimit());
    }

    @Test
    void addStockIsRefusedWhenTheWatchlistIsAtItsCap() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("AAPL")).thenReturn(Optional.of("AAPL"));
        when(watchlistMapper.watchlistItemExists(10L, "AAPL")).thenReturn(false);
        when(watchlistMapper.insertWatchlistItemIfUnderLimit(any(WatchlistItem.class), anyInt())).thenReturn(0);

        WatchlistItemLimitExceededException ex = assertThrows(
                WatchlistItemLimitExceededException.class,
                () -> watchlistService.addStock(55L, 100L, 10L, "AAPL"));

        assertEquals("WLI-422", ex.getErrorCode());
        assertEquals(MAX_ITEMS, ex.getLimit());
    }

    // ---- listing: items carry a live price, and no query per watchlist ----

    @Test
    void listWatchlistsShowsLivePriceBesideEachEntryWithoutAQueryPerWatchlist() {
        allowAccountAccess(55L, 100L);
        OffsetDateTime quotedAt = OffsetDateTime.parse("2026-01-10T09:59:30Z");
        // The executor has a quote for AAPL only; MSFT has none yet.
        when(quoteSource.latest(List.of("AAPL", "MSFT")))
                .thenReturn(Map.of("AAPL", new Quote("AAPL", new BigDecimal("189.50"), quotedAt)));

        when(watchlistMapper.selectWatchlistsByAccountId(100L)).thenReturn(List.of(
                sampleWatchlist(10L, 100L, "Core"),
                sampleWatchlist(11L, 100L, "Other")));
        when(watchlistMapper.selectItemsByAccountId(100L)).thenReturn(List.of(
                new WatchlistItem(10L, "AAPL", OffsetDateTime.parse("2026-01-10T10:15:00Z")),
                new WatchlistItem(10L, "MSFT", OffsetDateTime.parse("2026-01-10T10:16:00Z"))));

        List<WatchlistResponse> response = watchlistService.listWatchlists(55L, 100L);

        assertEquals(2, response.size());
        WatchlistItemResponse aapl = response.get(0).items().get(0);
        assertEquals("AAPL", aapl.tickerSymbol());
        assertEquals(new BigDecimal("189.50"), aapl.price());
        assertEquals(quotedAt, aapl.quotedAt());
        assertEquals(PriceStatus.LIVE, aapl.priceStatus());

        WatchlistItemResponse msft = response.get(0).items().get(1);
        assertEquals("MSFT", msft.tickerSymbol());
        assertEquals(PriceStatus.UNAVAILABLE, msft.priceStatus());

        assertEquals(0, response.get(1).items().size());
        // No query per watchlist, and one call for the prices of the whole page.
        verify(watchlistMapper, never()).selectWatchlistItems(anyLong());
        verify(quoteSource, times(1)).latest(anyCollection());
    }

    @Test
    void anEmptyWatchlistDoesNotAskForPrices() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistsByAccountId(100L)).thenReturn(List.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectItemsByAccountId(100L)).thenReturn(List.of());

        watchlistService.listWatchlists(55L, 100L);

        verifyNoInteractions(quoteSource);
    }

    @Test
    void anInstrumentWithNoQuoteYetHasNoPriceRatherThanAnError() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistsByAccountId(100L)).thenReturn(List.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectItemsByAccountId(100L)).thenReturn(List.of(
                new WatchlistItem(10L, "MSFT", OffsetDateTime.parse("2026-01-10T10:16:00Z"))));

        WatchlistItemResponse item = watchlistService.listWatchlists(55L, 100L).get(0).items().get(0);

        assertNull(item.price());
        assertNull(item.quotedAt());
        assertEquals(PriceStatus.UNAVAILABLE, item.priceStatus());
    }

    @Test
    void anOldQuoteIsMarkedStale() {
        allowAccountAccess(55L, 100L);
        when(quoteSource.latest(List.of("AAPL"))).thenReturn(Map.of("AAPL",
                new Quote("AAPL", new BigDecimal("180.00"), OffsetDateTime.parse("2026-01-10T09:00:00Z"))));
        when(watchlistMapper.selectWatchlistsByAccountId(100L)).thenReturn(List.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectItemsByAccountId(100L)).thenReturn(List.of(
                new WatchlistItem(10L, "AAPL", OffsetDateTime.parse("2026-01-10T08:00:00Z"))));

        WatchlistItemResponse item = watchlistService.listWatchlists(55L, 100L).get(0).items().get(0);

        assertEquals(PriceStatus.STALE, item.priceStatus());
    }

    // ---- an instrument is added and shows a live price ----

    @Test
    void addStockAddsAnInstrumentAndShowsItsLivePrice() {
        allowAccountAccess(55L, 100L);
        when(quoteSource.latest(List.of("AAPL"))).thenReturn(Map.of("AAPL",
                new Quote("AAPL", new BigDecimal("189.50"), OffsetDateTime.parse("2026-01-10T09:59:50Z"))));
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("aapl")).thenReturn(Optional.of("AAPL"));
        when(watchlistMapper.watchlistItemExists(10L, "AAPL")).thenReturn(false);
        when(watchlistMapper.insertWatchlistItemIfUnderLimit(any(WatchlistItem.class), anyInt())).thenReturn(1);
        when(watchlistMapper.selectWatchlistItems(10L)).thenReturn(List.of(
                new WatchlistItem(10L, "AAPL", OffsetDateTime.parse("2026-01-10T10:15:00Z"))));

        WatchlistResponse response = watchlistService.addStock(55L, 100L, 10L, " aapl ");

        assertEquals(1, response.items().size());
        assertEquals("AAPL", response.items().get(0).tickerSymbol());
        assertEquals(new BigDecimal("189.50"), response.items().get(0).price());
        assertEquals(PriceStatus.LIVE, response.items().get(0).priceStatus());

        ArgumentCaptor<WatchlistItem> saved = ArgumentCaptor.forClass(WatchlistItem.class);
        verify(watchlistMapper).insertWatchlistItemIfUnderLimit(saved.capture(), org.mockito.ArgumentMatchers.eq(MAX_ITEMS));
        assertEquals("AAPL", saved.getValue().getTickerSymbol());
    }

    @Test
    void addStockDoesNotRequireAHolding() {
        // The service never consults holdings: watching is not owning.
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("NVDA")).thenReturn(Optional.of("NVDA"));
        when(watchlistMapper.watchlistItemExists(10L, "NVDA")).thenReturn(false);
        when(watchlistMapper.insertWatchlistItemIfUnderLimit(any(WatchlistItem.class), anyInt())).thenReturn(1);
        when(watchlistMapper.selectWatchlistItems(10L)).thenReturn(List.of(
                new WatchlistItem(10L, "NVDA", OffsetDateTime.parse("2026-01-10T10:15:00Z"))));

        WatchlistResponse response = watchlistService.addStock(55L, 100L, 10L, "NVDA");

        assertEquals("NVDA", response.items().get(0).tickerSymbol());
    }

    @Test
    void addStockRequiresAKnownTradableInstrument() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("NOPE")).thenReturn(Optional.empty());

        assertThrows(
                InstrumentNotFoundException.class,
                () -> watchlistService.addStock(55L, 100L, 10L, "NOPE"));
    }

    @Test
    void addStockRejectsDuplicateTicker() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("AAPL")).thenReturn(Optional.of("AAPL"));
        when(watchlistMapper.watchlistItemExists(10L, "AAPL")).thenReturn(true);

        assertThrows(
                WatchlistItemAlreadyExistsException.class,
                () -> watchlistService.addStock(55L, 100L, 10L, "AAPL"));

        verify(watchlistMapper, never()).insertWatchlistItemIfUnderLimit(any(), anyInt());
    }

    @Test
    void addStockReportsDuplicateWhenTwoRequestsRace() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.selectTradableTicker("AAPL")).thenReturn(Optional.of("AAPL"));
        when(watchlistMapper.watchlistItemExists(10L, "AAPL")).thenReturn(false);
        when(watchlistMapper.insertWatchlistItemIfUnderLimit(any(WatchlistItem.class), anyInt()))
                .thenThrow(new DuplicateKeyException("watchlist_item_pkey"));

        assertThrows(
                WatchlistItemAlreadyExistsException.class,
                () -> watchlistService.addStock(55L, 100L, 10L, "AAPL"));
    }

    // ---- rename / delete / remove ----

    @Test
    void renameWatchlistRejectsNameUsedByAnotherWatchlist() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Old")));
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "New"))
                .thenReturn(Optional.of(sampleWatchlist(20L, 100L, "New")));

        assertThrows(
                WatchlistNameConflictException.class,
                () -> watchlistService.renameWatchlist(55L, 100L, 10L, "New"));
    }

    @Test
    void renameWatchlistSucceeds() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Old")));
        when(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "Renamed")).thenReturn(Optional.empty());
        when(watchlistMapper.selectWatchlistItems(10L)).thenReturn(List.of());

        WatchlistResponse response = watchlistService.renameWatchlist(55L, 100L, 10L, " Renamed ");

        assertEquals("Renamed", response.name());
        verify(watchlistMapper).updateWatchlistName(10L, "Renamed");
    }

    @Test
    void deleteWatchlistRequiresExistingWatchlist() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.empty());

        assertThrows(
                WatchlistNotFoundException.class,
                () -> watchlistService.deleteWatchlist(55L, 100L, 10L));

        verify(watchlistMapper, never()).deleteWatchlist(anyLong());
    }

    @Test
    void removeStockRejectsMissingTicker() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.deleteWatchlistItem(10L, "AAPL")).thenReturn(0);

        assertThrows(
                WatchlistItemNotFoundException.class,
                () -> watchlistService.removeStock(55L, 100L, 10L, "AAPL"));
    }

    @Test
    void removeStockSucceeds() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 100L, "Core")));
        when(watchlistMapper.deleteWatchlistItem(10L, "AAPL")).thenReturn(1);
        when(watchlistMapper.selectWatchlistItems(10L)).thenReturn(List.of());

        WatchlistResponse response = watchlistService.removeStock(55L, 100L, 10L, "AAPL");

        assertEquals(0, response.items().size());
    }

    // ---- access control on every route ----

    @Test
    void accountMustExist() {
        when(accountMapper.accountExists(100)).thenReturn(false);

        assertThrows(
                AccountNotFoundException.class,
                () -> watchlistService.listWatchlists(55L, 100L));
    }

    @Test
    void accountMustBeLinkedToTheCallerOnEveryRoute() {
        when(accountMapper.accountExists(100)).thenReturn(true);
        when(accountMapper.selectAccountLinkedUserId(100)).thenReturn(99);

        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.createWatchlist(55L, 100L, "Core"));
        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.listWatchlists(55L, 100L));
        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.renameWatchlist(55L, 100L, 10L, "X"));
        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.deleteWatchlist(55L, 100L, 10L));
        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.addStock(55L, 100L, 10L, "AAPL"));
        assertThrows(WatchlistAccessDeniedException.class, () -> watchlistService.removeStock(55L, 100L, 10L, "AAPL"));

        verify(watchlistMapper, never()).selectWatchlistById(anyLong());
    }

    @Test
    void aWatchlistOwnedByAnotherAccountIsReportedAsNotFound() {
        allowAccountAccess(55L, 100L);
        when(watchlistMapper.selectWatchlistById(10L)).thenReturn(Optional.of(sampleWatchlist(10L, 200L, "Core")));

        assertThrows(WatchlistNotFoundException.class, () -> watchlistService.deleteWatchlist(55L, 100L, 10L));
        assertThrows(WatchlistNotFoundException.class, () -> watchlistService.renameWatchlist(55L, 100L, 10L, "X"));
        assertThrows(WatchlistNotFoundException.class, () -> watchlistService.addStock(55L, 100L, 10L, "AAPL"));
        assertThrows(WatchlistNotFoundException.class, () -> watchlistService.removeStock(55L, 100L, 10L, "AAPL"));

        verify(watchlistMapper, never()).deleteWatchlist(anyLong());
    }

    private void allowAccountAccess(long userId, long accountId) {
        when(accountMapper.accountExists(Math.toIntExact(accountId))).thenReturn(true);
        when(accountMapper.selectAccountLinkedUserId(Math.toIntExact(accountId))).thenReturn(Math.toIntExact(userId));
    }

    private static Watchlist sampleWatchlist(long watchlistId, long accountId, String name) {
        return new Watchlist(
                watchlistId,
                accountId,
                name,
                OffsetDateTime.parse("2026-01-10T10:00:00Z"),
                OffsetDateTime.parse("2026-01-10T10:00:00Z"));
    }
}
