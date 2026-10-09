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
 * Guards a design rule: <b>market prices are never stored</b>. The only copy is the in-memory quote store the
 * market-data consumer fills, so nothing in the module's tables or mapper should be able to hold a quote or a latest
 * price.
 *
 * <p>Price alerts add exactly two price-valued columns, and they are not market data: {@code alert_target_price} is the
 * customer's own threshold (the story needs it stored), and {@code alert_trigger_price} is the single quote that
 * crossed it, written once when the alert fires and never updated by the quote stream. Both are named here on purpose.
 * Any other price or quote column, table or mapper method still fails this test.
 */
class WatchlistPricesAreNotStoredTest {

    /** The only price-valued alert columns, as they appear in SQL (lower case). */
    private static final java.util.List<String> ALERT_PRICE_NAMES = java.util.List.of(
            "alert_target_price", "alert_trigger_price",
            // the same two as MyBatis arguments and parameters in the XML
            "alerttargetprice", "alerttriggerprice", "targetprice", "triggerprice");

    /** The two alert statements that carry a price in; nothing else may take or return one. */
    private static final java.util.Set<String> ALERT_PRICE_METHODS = java.util.Set.of("setAlertIfUnderLimit", "markTriggered");

    private static String withoutAlertPrices(String text) {
        String cleaned = text;
        for (String name : ALERT_PRICE_NAMES) {
            cleaned = cleaned.replace(name, "");
        }
        return cleaned;
    }

    @Test
    void theModulesTablesHaveNoPriceColumnAndNoQuoteTable() throws IOException {
        try (var stream = getClass().getClassLoader().getResourceAsStream("watchlist-schema.sql")) {
            assertNotNull(stream);
            String sql = withoutAlertPrices(new String(stream.readAllBytes(), StandardCharsets.UTF_8)
                    .replaceAll("(?m)--.*$", "")
                    .toLowerCase());

            assertFalse(sql.contains("price"), "watchlist tables must not hold a market price");
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

            assertFalse(touchesPrice && !ALERT_PRICE_METHODS.contains(method.getName()),
                    method.getName() + " must not read or write a price");
        }
    }

    @Test
    void theMapperXmlNeverMentionsAQuoteTable() throws IOException {
        try (var stream = getClass().getClassLoader().getResourceAsStream("mapper/WatchlistMapper.xml")) {
            assertNotNull(stream);
            String xml = withoutAlertPrices(new String(stream.readAllBytes(), StandardCharsets.UTF_8).toLowerCase());

            assertFalse(xml.contains("market_quote"));
            assertFalse(xml.contains("price"), "only the alert's target and trigger price may appear");
        }
    }

    @Test
    void anyOtherPriceColumnWouldStillFailTheGuard() {
        // The guard is only worth having if it still catches a price the alert columns do not explain.
        String sql = "create table watchlist_item (alert_target_price numeric, last_price numeric)";

        org.junit.jupiter.api.Assertions.assertTrue(withoutAlertPrices(sql).contains("price"));
    }
}
