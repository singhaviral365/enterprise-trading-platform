package org.example.backend.watchlist.model;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WatchlistEntitiesTest {

    @Test
    void watchlistNormalizesName() {
        Watchlist watchlist = new Watchlist(
                1L,
                99L,
                "  Core Holdings  ",
                OffsetDateTime.parse("2026-01-01T00:00:00Z"),
                OffsetDateTime.parse("2026-01-01T00:00:00Z"));

        assertEquals("Core Holdings", watchlist.getName());
        assertEquals(99L, watchlist.getAccountId());
    }

    @Test
    void watchlistRejectsBlankName() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Watchlist(
                        1L,
                        99L,
                        "   ",
                        OffsetDateTime.parse("2026-01-01T00:00:00Z"),
                        OffsetDateTime.parse("2026-01-01T00:00:00Z")));
    }

    @Test
    void watchlistItemNormalizesTicker() {
        WatchlistItem item = new WatchlistItem(
                1L,
                "  AAPL  ",
                OffsetDateTime.parse("2026-01-01T00:00:00Z"));

        assertEquals("AAPL", item.getTickerSymbol());
        assertEquals(1L, item.getWatchlistId());
    }

    @Test
    void watchlistItemRejectsLongTicker() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new WatchlistItem(
                        1L,
                        "A12345678901234567890",
                        OffsetDateTime.parse("2026-01-01T00:00:00Z")));
    }
}

