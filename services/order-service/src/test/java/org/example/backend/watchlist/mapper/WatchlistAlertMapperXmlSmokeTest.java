package org.example.backend.watchlist.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** What can be checked about the alert SQL without a database. */
class WatchlistAlertMapperXmlSmokeTest {

    private static String resource(String path) throws IOException {
        try (var stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path)) {
            assertNotNull(stream, path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void everyMapperMethodHasAStatement() throws IOException {
        String xml = resource("mapper/WatchlistMapper.xml");

        for (var method : WatchlistMapper.class.getDeclaredMethods()) {
            assertTrue(xml.contains("id=\"" + method.getName() + "\""), "no statement for " + method.getName());
        }
    }

    @Test
    void firingIsGuardedSoItHappensOnce() throws IOException {
        String xml = resource("mapper/WatchlistMapper.xml");
        int start = xml.indexOf("id=\"markTriggered\"");
        String statement = xml.substring(start, xml.indexOf("</update>", start));

        assertTrue(statement.contains("alert_status = 'ACTIVE'"));
        assertTrue(statement.contains("alert_direction = #{direction}"));
        assertTrue(statement.contains("alert_target_price = #{targetPrice}"));
    }

    @Test
    void theCapCountAndTheWriteAreOneStatement() throws IOException {
        String xml = resource("mapper/WatchlistMapper.xml");
        int start = xml.indexOf("id=\"setAlertIfUnderLimit\"");
        String statement = xml.substring(start, xml.indexOf("</update>", start));

        assertTrue(statement.contains("SELECT COUNT(*)"));
        assertTrue(statement.contains("alert_status = 'ACTIVE'"));
        assertTrue(statement.contains("&lt; #{limit}"));
        assertTrue(statement.contains("w.account_id = #{accountId}"));
    }

    @Test
    void noSubstitutionPutsCustomerInputIntoSql() throws IOException {
        assertFalse(resource("mapper/WatchlistMapper.xml").contains("${"));
    }

    @Test
    void theSchemaHoldsTheAlertTogetherAndIndexesTheHotLookup() throws IOException {
        String sql = resource("watchlist-schema.sql");

        assertTrue(sql.contains("chk_watchlist_item_alert_shape"));
        assertTrue(sql.contains("idx_watchlist_item_active_alert"));
        assertTrue(sql.contains("WHERE alert_status = 'ACTIVE'"));
        assertTrue(sql.contains("idx_watchlist_item_alert_undelivered"));
        assertTrue(sql.contains("alert_delivery IN ('PENDING', 'HANDED_OVER', 'FAILED')"));
    }

    @Test
    void thePricesAreStillNotStored() throws IOException {
        // An alert stores the customer's target and the price that crossed it, never a quote feed or a price cache.
        String sql = resource("watchlist-schema.sql").toLowerCase();

        assertFalse(sql.matches("(?s).*create table[^;]*quote.*"), "no quote table");
        assertFalse(sql.contains("latest_price"));
        assertFalse(sql.contains("last_price"));
    }
}
