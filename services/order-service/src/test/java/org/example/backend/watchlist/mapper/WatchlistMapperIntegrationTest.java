package org.example.backend.watchlist.mapper;

import org.example.backend.watchlist.model.Watchlist;
import org.example.backend.watchlist.model.WatchlistItem;
import org.example.backend.support.PostgresIntegrationSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Disabled("Requires Docker/Testcontainers")
class WatchlistMapperIntegrationTest extends PostgresIntegrationSupport {

    @Autowired
    private WatchlistMapper watchlistMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.execute("DROP TABLE IF EXISTS watchlist_item");
        jdbcTemplate.execute("DROP TABLE IF EXISTS watchlist");
        jdbcTemplate.execute("DROP TABLE IF EXISTS account");
        jdbcTemplate.execute("DROP TABLE IF EXISTS instrument");

        jdbcTemplate.execute("""
                CREATE TABLE account (
                    account_id BIGINT PRIMARY KEY,
                    user_id INTEGER NOT NULL
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE instrument (
                    instrument_ticker VARCHAR(20) PRIMARY KEY,
                    instrument_status VARCHAR(20) NOT NULL DEFAULT 'TRADING'
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE watchlist (
                    watchlist_id BIGSERIAL PRIMARY KEY,
                    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_watchlist_account_name UNIQUE (account_id, name)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE watchlist_item (
                    watchlist_id BIGINT NOT NULL REFERENCES watchlist(watchlist_id) ON DELETE CASCADE,
                    ticker_symbol VARCHAR(20) NOT NULL REFERENCES instrument(instrument_ticker),
                    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (watchlist_id, ticker_symbol)
                )
                """);

        jdbcTemplate.update("INSERT INTO account (account_id, user_id) VALUES (100, 7)");
        jdbcTemplate.update("INSERT INTO instrument (instrument_ticker) VALUES ('AAPL'), ('MSFT')");
    }

    @Test
    void watchlistCrudAndItemsWork() {
        long watchlistId = watchlistMapper.nextWatchlistId();
        OffsetDateTime now = OffsetDateTime.parse("2026-01-01T00:00:00Z");

        Watchlist watchlist = new Watchlist(watchlistId, 100L, "Core", now, now);
        assertEquals(1, watchlistMapper.insertWatchlistIfUnderLimit(watchlist, 10));

        Optional<Watchlist> byId = watchlistMapper.selectWatchlistById(watchlistId);
        assertTrue(byId.isPresent());
        assertEquals("Core", byId.get().getName());

        assertTrue(watchlistMapper.selectWatchlistByAccountIdAndName(100L, "core").isPresent());

        assertEquals(1, watchlistMapper.updateWatchlistName(watchlistId, "Growth"));

        WatchlistItem item = new WatchlistItem(watchlistId, "AAPL", now);
        assertEquals(1, watchlistMapper.insertWatchlistItemIfUnderLimit(item, 50));
        assertTrue(watchlistMapper.watchlistItemExists(watchlistId, "AAPL"));

        List<WatchlistItem> items = watchlistMapper.selectWatchlistItems(watchlistId);
        assertEquals(1, items.size());
        assertEquals("AAPL", items.get(0).getTickerSymbol());

        assertEquals(Optional.of("MSFT"), watchlistMapper.selectTradableTicker("msft"));
        assertEquals(1, watchlistMapper.selectItemsByAccountId(100L).size());

        assertEquals(1, watchlistMapper.deleteWatchlistItem(watchlistId, "AAPL"));
        assertEquals(1, watchlistMapper.deleteWatchlist(watchlistId));
    }

    @Test
    void capsAreEnforcedByTheInsertStatement() {
        OffsetDateTime now = OffsetDateTime.parse("2026-01-01T00:00:00Z");

        assertEquals(1, watchlistMapper.insertWatchlistIfUnderLimit(
                new Watchlist(watchlistMapper.nextWatchlistId(), 100L, "One", now, now), 2));
        assertEquals(1, watchlistMapper.insertWatchlistIfUnderLimit(
                new Watchlist(watchlistMapper.nextWatchlistId(), 100L, "Two", now, now), 2));
        assertEquals(0, watchlistMapper.insertWatchlistIfUnderLimit(
                new Watchlist(watchlistMapper.nextWatchlistId(), 100L, "Three", now, now), 2));

        long watchlistId = watchlistMapper.selectWatchlistsByAccountId(100L).get(0).getWatchlistId();
        assertEquals(1, watchlistMapper.insertWatchlistItemIfUnderLimit(new WatchlistItem(watchlistId, "AAPL", now), 1));
        assertEquals(0, watchlistMapper.insertWatchlistItemIfUnderLimit(new WatchlistItem(watchlistId, "MSFT", now), 1));
    }
}
