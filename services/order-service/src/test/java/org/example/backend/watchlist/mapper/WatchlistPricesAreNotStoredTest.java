package org.example.backend.watchlist.mapper;

import org.example.backend.watchlist.price.Quote;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Guards a design rule: prices are never stored. The only copy is the in-memory quote store the
 * market-data consumer fills, so nothing in the module's tables or mapper should be able to hold one.
 */
class WatchlistPricesAreNotStoredTest {

    @Test
    void theModulesTablesHaveNoPriceColumnAndNoQuoteTable() throws IOException {
        try (var stream = getClass().getClassLoader().getResourceAsStream("watchlist-schema.sql")) {
            assertNotNull(stream);
            String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8)
                    .replaceAll("(?m)--.*$", "")
                    .toLowerCase();

            assertFalse(sql.contains("price"), "watchlist tables must not hold a price");
            assertFalse(sql.contains("quote"), "watchlist tables must not hold quotes");
        }
    }

    @Test
    void theMapperCannotReadOrWriteAPrice() {
        for (Method method : WatchlistMapper.class.getDeclaredMethods()) {
            boolean touchesPrice = Arrays.stream(method.getParameterTypes())
                    .anyMatch(type -> type == Quote.class || type == BigDecimal.class)
                    || method.getReturnType() == Quote.class
                    || method.getGenericReturnType().getTypeName().contains(Quote.class.getName());

            assertFalse(touchesPrice, method.getName() + " must not read or write a price");
        }
    }

    @Test
    void theMapperXmlNeverMentionsAQuoteTable() throws IOException {
        try (var stream = getClass().getClassLoader().getResourceAsStream("mapper/WatchlistMapper.xml")) {
            assertNotNull(stream);
            String xml = new String(stream.readAllBytes(), StandardCharsets.UTF_8).toLowerCase();

            assertFalse(xml.contains("market_quote"));
            assertFalse(xml.contains("price"));
        }
    }
}
