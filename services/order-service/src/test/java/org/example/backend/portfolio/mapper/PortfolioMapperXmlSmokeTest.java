package org.example.backend.portfolio.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** No database here, so this guards what can be checked without one. */
class PortfolioMapperXmlSmokeTest {

    private static String resource(String path) throws IOException {
        try (var stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path)) {
            assertNotNull(stream, path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void everyMapperMethodHasAStatement() throws IOException {
        String xml = resource("mapper/PortfolioMapper.xml");

        assertTrue(xml.contains("namespace=\"org.example.backend.portfolio.mapper.PortfolioMapper\""));
        for (var method : PortfolioMapper.class.getDeclaredMethods()) {
            assertTrue(xml.contains("id=\"" + method.getName() + "\""), "no statement for " + method.getName());
        }
    }

    @Test
    void bookingASaleTwiceIsANoOpAtTheDatabase() throws IOException {
        assertTrue(resource("mapper/PortfolioMapper.xml").contains("ON CONFLICT (order_id) DO NOTHING"));
        assertTrue(resource("portfolio-schema.sql").contains("order_id BIGINT PRIMARY KEY"));
    }

    @Test
    void everyValueIsBoundNeverConcatenated() throws IOException {
        assertFalse(resource("mapper/PortfolioMapper.xml").contains("${"));
    }

    @Test
    void theLedgerStoresNoLivePriceOnlyFactsOfThePastSale() throws IOException {
        // Comments say what is NOT stored, so only the statements themselves are checked.
        String sql = resource("portfolio-schema.sql").replaceAll("(?m)--.*$", "").toLowerCase();

        // Live figures are never stored. The only prices are the sale's own fill price and the cost at that sale.
        for (String forbidden : List_of("market_value", "unrealised", "last_price", "quote", "day_pnl")) {
            assertFalse(sql.contains(forbidden.toLowerCase()), "a live figure must not be stored: " + forbidden);
        }
        assertTrue(sql.contains("fill_price"));
        assertTrue(sql.contains("average_cost_at_sale"));
        assertTrue(sql.contains("realised_pnl"));
    }

    @Test
    void theLedgerTableAndItsIndexAreInTheFreshDatabaseScriptToo() throws IOException {
        String create = java.nio.file.Files.readString(
                java.nio.file.Path.of("..", "..", "databases", "PostgreSQL", "trading", "schema.sql"),
                StandardCharsets.UTF_8);

        assertTrue(create.contains("CREATE TABLE IF NOT EXISTS realised_pnl_entry"));
        assertTrue(create.contains("idx_realised_pnl_account_booked"));
    }

    private static String[] List_of(String... values) {
        return values;
    }
}
