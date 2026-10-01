package org.example.backend.watchlist.exceptions;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WatchlistExceptionsTest {

    @Test
    void watchlistNotFoundExceptionCarriesMetadata() {
        WatchlistNotFoundException ex = new WatchlistNotFoundException(8L);

        assertEquals("WTL-404", ex.getErrorCode());
        assertEquals("Watchlist not found", ex.getMessage());
        assertEquals(8L, ex.getWatchlistId());
    }

    @Test
    void watchlistNameConflictExceptionCarriesMetadata() {
        WatchlistNameConflictException ex = new WatchlistNameConflictException(12L, "Core");

        assertEquals("WTL-409", ex.getErrorCode());
        assertEquals("Watchlist with this name already exists", ex.getMessage());
        assertEquals(12L, ex.getAccountId());
        assertEquals("Core", ex.getName());
    }

    @Test
    void watchlistItemAlreadyExistsExceptionCarriesMetadata() {
        WatchlistItemAlreadyExistsException ex = new WatchlistItemAlreadyExistsException(9L, "AAPL");

        assertEquals("WLI-409", ex.getErrorCode());
        assertEquals("Stock is already in the watchlist", ex.getMessage());
        assertEquals(9L, ex.getWatchlistId());
        assertEquals("AAPL", ex.getTickerSymbol());
    }

    @Test
    void watchlistItemNotFoundExceptionCarriesMetadata() {
        WatchlistItemNotFoundException ex = new WatchlistItemNotFoundException(9L, "AAPL");

        assertEquals("WLI-404", ex.getErrorCode());
        assertEquals("Stock not found in watchlist", ex.getMessage());
        assertEquals(9L, ex.getWatchlistId());
        assertEquals("AAPL", ex.getTickerSymbol());
    }

    @Test
    void watchlistAccessDeniedExceptionIsAcc403() {
        WatchlistAccessDeniedException ex = new WatchlistAccessDeniedException(5L);

        assertEquals("ACC-403", ex.getErrorCode());
        assertEquals(5L, ex.getAccountId());
    }

    @Test
    void watchlistLimitExceededExceptionCarriesMetadata() {
        WatchlistLimitExceededException ex = new WatchlistLimitExceededException(5L, 10);

        assertEquals("WTL-422", ex.getErrorCode());
        assertEquals("Watchlist limit reached", ex.getMessage());
        assertEquals(5L, ex.getAccountId());
        assertEquals(10, ex.getLimit());
    }

    @Test
    void watchlistItemLimitExceededExceptionCarriesMetadata() {
        WatchlistItemLimitExceededException ex = new WatchlistItemLimitExceededException(9L, 50);

        assertEquals("WLI-422", ex.getErrorCode());
        assertEquals("Watchlist item limit reached", ex.getMessage());
        assertEquals(9L, ex.getWatchlistId());
        assertEquals(50, ex.getLimit());
    }
}
