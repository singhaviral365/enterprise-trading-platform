package org.example.backend.watchlist.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.watchlist.alert.PriceAlertIndex;
import org.example.backend.watchlist.dto.WatchlistResponse;
import org.example.backend.watchlist.exceptions.PriceAlertAlreadyReachedException;
import org.example.backend.watchlist.exceptions.PriceAlertLimitExceededException;
import org.example.backend.watchlist.exceptions.PriceAlertNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistAccessDeniedException;
import org.example.backend.watchlist.exceptions.WatchlistItemNotFoundException;
import org.example.backend.watchlist.exceptions.WatchlistNotFoundException;
import org.example.backend.watchlist.mapper.WatchlistMapper;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.Watchlist;
import org.example.backend.watchlist.model.WatchlistItem;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PriceAlertServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-06T09:00:00Z");
    private static final int CAP = 20;

    private WatchlistMapper mapper;
    private AccountMapper accountMapper;
    private WatchlistService watchlistService;
    private QuoteSource quotes;
    private PriceAlertIndex index;
    private PriceAlertService service;

    @BeforeEach
    void setUp() {
        mapper = mock(WatchlistMapper.class);
        accountMapper = mock(AccountMapper.class);
        watchlistService = mock(WatchlistService.class);
        quotes = mock(QuoteSource.class);
        index = new PriceAlertIndex();
        WatchlistAccess access = new WatchlistAccess(mapper, accountMapper);
        service = new PriceAlertService(access, mapper, watchlistService, quotes, index, CAP, Clock.fixed(NOW, ZoneOffset.UTC));

        // Account 5 belongs to user 7 and owns watchlist 9, which holds AAPL.
        when(accountMapper.accountExists(5)).thenReturn(true);
        when(accountMapper.selectAccountLinkedUserId(5)).thenReturn(7);
        when(mapper.selectWatchlistById(9)).thenReturn(Optional.of(new Watchlist(9, 5, "Tech", T0, T0)));
        when(mapper.selectWatchlistItems(9)).thenReturn(List.of(new WatchlistItem(9, "AAPL", T0)));
        when(quotes.latest(any())).thenReturn(Map.of());
        when(mapper.setAlertIfUnderLimit(anyLong(), anyLong(), any(), any(), any(), any(), anyInt())).thenReturn(1);
        when(watchlistService.getWatchlist(7, 5, 9)).thenReturn(mock(WatchlistResponse.class));
    }

    private void set(String ticker, AlertDirection direction, String target) {
        service.setAlert(7, 5, 9, ticker, direction, new BigDecimal(target));
    }

    @Test
    void anAlertIsSetOnAnEntryOfTheCallersOwnWatchlistAndArmedInTheIndex() {
        set("aapl", AlertDirection.ABOVE, "200.50");

        verify(mapper).setAlertIfUnderLimit(5, 9, "AAPL", AlertDirection.ABOVE, new BigDecimal("200.50"),
                OffsetDateTime.parse("2026-10-06T10:00:00Z"), CAP);
        assertEquals(1, index.candidates("AAPL").size());
        assertEquals(new BigDecimal("200.50"), index.candidates("AAPL").get(0).targetPrice());
    }

    @Test
    void theAccountLockIsTakenBeforeTheCountedWrite() {
        set("AAPL", AlertDirection.BELOW, "100");

        var order = inOrder(mapper);
        order.verify(mapper).lockAccountForAlerts(5);
        order.verify(mapper).setAlertIfUnderLimit(anyLong(), anyLong(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void creationIsCappedPerAccount() {
        when(mapper.setAlertIfUnderLimit(anyLong(), anyLong(), any(), any(), any(), any(), anyInt())).thenReturn(0);

        PriceAlertLimitExceededException ex = assertThrows(PriceAlertLimitExceededException.class,
                () -> set("AAPL", AlertDirection.ABOVE, "200"));

        assertEquals("ALR-422", ex.getErrorCode());
        assertEquals(CAP, ex.getLimit());
        assertTrue(index.candidates("AAPL").isEmpty(), "a refused alert is never armed");
    }

    @Test
    void aWatchlistOfAnotherAccountIsNotFoundSoTheCallerLearnsNothingAboutIt() {
        when(mapper.selectWatchlistById(10)).thenReturn(Optional.of(new Watchlist(10, 6, "Theirs", T0, T0)));

        assertThrows(WatchlistNotFoundException.class,
                () -> service.setAlert(7, 5, 10, "AAPL", AlertDirection.ABOVE, new BigDecimal("200")));
        verify(mapper, never()).setAlertIfUnderLimit(anyLong(), anyLong(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void anAccountTheTokensUserDoesNotOwnIsRefused() {
        assertThrows(WatchlistAccessDeniedException.class,
                () -> service.setAlert(8, 5, 9, "AAPL", AlertDirection.ABOVE, new BigDecimal("200")));
        assertThrows(WatchlistAccessDeniedException.class, () -> service.clearAlert(8, 5, 9, "AAPL"));
        assertThrows(AccountNotFoundException.class,
                () -> service.setAlert(7, 99, 9, "AAPL", AlertDirection.ABOVE, new BigDecimal("200")));
    }

    @Test
    void aStockThatIsNotOnTheWatchlistCannotCarryAnAlert() {
        assertThrows(WatchlistItemNotFoundException.class, () -> set("MSFT", AlertDirection.ABOVE, "400"));
    }

    @Test
    void anAboveAlertAtOrBelowTheCurrentPriceIsRefusedBecauseItWouldFireAtOnce() {
        when(quotes.latest(any())).thenReturn(Map.of("AAPL", new Quote("AAPL", new BigDecimal("201"), T0)));

        assertThrows(PriceAlertAlreadyReachedException.class, () -> set("AAPL", AlertDirection.ABOVE, "200"));
        assertThrows(PriceAlertAlreadyReachedException.class, () -> set("AAPL", AlertDirection.ABOVE, "201"));
        set("AAPL", AlertDirection.ABOVE, "201.01");
    }

    @Test
    void aBelowAlertAtOrAboveTheCurrentPriceIsRefused() {
        when(quotes.latest(any())).thenReturn(Map.of("AAPL", new Quote("AAPL", new BigDecimal("150"), T0)));

        assertThrows(PriceAlertAlreadyReachedException.class, () -> set("AAPL", AlertDirection.BELOW, "150"));
        assertThrows(PriceAlertAlreadyReachedException.class, () -> set("AAPL", AlertDirection.BELOW, "160"));
        set("AAPL", AlertDirection.BELOW, "149.99");
    }

    @Test
    void withNoPriceKnownYetAnyTargetIsAccepted() {
        set("AAPL", AlertDirection.ABOVE, "1");
        set("AAPL", AlertDirection.BELOW, "9999");
    }

    @Test
    void theTargetIsValidated() {
        assertThrows(IllegalArgumentException.class, () -> set("AAPL", AlertDirection.ABOVE, "0"));
        assertThrows(IllegalArgumentException.class, () -> set("AAPL", AlertDirection.ABOVE, "-5"));
        assertThrows(IllegalArgumentException.class, () -> set("AAPL", AlertDirection.ABOVE, "1.23456"));
        assertThrows(IllegalArgumentException.class, () -> set("AAPL", AlertDirection.ABOVE, "1000000001"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setAlert(7, 5, 9, "AAPL", null, new BigDecimal("1")));
        assertThrows(IllegalArgumentException.class,
                () -> service.setAlert(7, 5, 9, "AAPL", AlertDirection.ABOVE, null));
        assertThrows(IllegalArgumentException.class, () -> set("   ", AlertDirection.ABOVE, "1"));
        set("AAPL", AlertDirection.ABOVE, "1.2300");
    }

    @Test
    void clearingRemovesTheAlertAndDisarmsTheIndex() {
        set("AAPL", AlertDirection.ABOVE, "200");
        when(mapper.clearAlert(9, "AAPL")).thenReturn(1);

        service.clearAlert(7, 5, 9, "aapl");

        verify(mapper).clearAlert(9, "AAPL");
        assertTrue(index.candidates("AAPL").isEmpty());
    }

    @Test
    void clearingAnEntryWithNoAlertIsNotFound() {
        when(mapper.clearAlert(9, "AAPL")).thenReturn(0);

        PriceAlertNotFoundException ex = assertThrows(PriceAlertNotFoundException.class, () -> service.clearAlert(7, 5, 9, "AAPL"));

        assertEquals("ALR-404", ex.getErrorCode());
    }
}
