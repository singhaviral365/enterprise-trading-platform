package org.example.backend.watchlist.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WatchlistMapperXmlSmokeTest {

    @Test
    void xmlContainsAllMappedStatements() throws IOException {
        try (var stream = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("mapper/WatchlistMapper.xml")) {

            assertNotNull(stream);

            String xml = new String(stream.readAllBytes(), StandardCharsets.UTF_8);

            assertTrue(xml.contains("namespace=\"org.example.backend.watchlist.mapper.WatchlistMapper\""));
            assertTrue(xml.contains("id=\"nextWatchlistId\""));
            assertTrue(xml.contains("id=\"insertWatchlistIfUnderLimit\""));
            assertTrue(xml.contains("id=\"selectWatchlistsByAccountId\""));
            assertTrue(xml.contains("id=\"selectWatchlistById\""));
            assertTrue(xml.contains("id=\"selectWatchlistByAccountIdAndName\""));
            assertTrue(xml.contains("id=\"updateWatchlistName\""));
            assertTrue(xml.contains("id=\"deleteWatchlist\""));
            assertTrue(xml.contains("id=\"selectWatchlistItems\""));
            assertTrue(xml.contains("id=\"selectItemsByAccountId\""));
            assertTrue(xml.contains("id=\"watchlistItemExists\""));
            assertTrue(xml.contains("id=\"insertWatchlistItemIfUnderLimit\""));
            assertTrue(xml.contains("id=\"deleteWatchlistItem\""));
            assertTrue(xml.contains("id=\"selectTradableTicker\""));
        }
    }
}


