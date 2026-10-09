package org.example.backend.watchlist.dto;

import org.junit.jupiter.api.Test;

import org.example.backend.watchlist.price.PriceStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WatchlistDtoTest {

    @Test
    void requestRecordsExposeFields() {
        CreateWatchlistRequest create = new CreateWatchlistRequest("Core");
        RenameWatchlistRequest rename = new RenameWatchlistRequest("Growth");
        AddWatchlistItemRequest add = new AddWatchlistItemRequest("AAPL");

        assertEquals("Core", create.name());
        assertEquals("Growth", rename.name());
        assertEquals("AAPL", add.tickerSymbol());
    }

    @Test
    void responseRecordsExposeFields() {
        OffsetDateTime now = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        WatchlistItemResponse item = new WatchlistItemResponse(
                "AAPL", now, new BigDecimal("189.50"), now, PriceStatus.LIVE);
        WatchlistResponse response = new WatchlistResponse(
                10L,
                99L,
                "Core",
                now,
                now,
                List.of(item));

        assertEquals("AAPL", item.tickerSymbol());
        assertEquals(new BigDecimal("189.50"), item.price());
        assertEquals(PriceStatus.LIVE, item.priceStatus());
        assertEquals(10L, response.watchlistId());
        assertEquals(99L, response.accountId());
        assertEquals("Core", response.name());
        assertEquals(1, response.items().size());
    }
}

