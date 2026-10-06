package org.example.backend.preferences.model;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PreferenceModelTest {

    @Test
    void aRowAndTheDocumentConvertBothWaysWithoutLosingAnything() {
        CustomerPreferences original = new CustomerPreferences(
                "GBP",
                EnumSet.of(NotificationChannel.SMS, NotificationChannel.IN_APP),
                EnumSet.of(NotificationCategory.ORDER_STATUS),
                DateFormatOption.YYYY_MM_DD, TimeFormatOption.H24, NumberFormatOption.IN, true,
                ThemeOption.LIGHT, LandingPage.ORDERS, OrderTypeOption.LIMIT);

        assertEquals(original, PreferenceRow.of(1L, original).toPreferences());
    }

    @Test
    void theDocumentHoldsCopiesSoACallerCannotChangeItAfterwards() {
        EnumSet<NotificationChannel> channels = EnumSet.of(NotificationChannel.EMAIL);
        CustomerPreferences preferences = CustomerPreferences.defaults("USD");
        CustomerPreferences custom = new CustomerPreferences(
                "USD", channels, EnumSet.noneOf(NotificationCategory.class), preferences.dateFormat(),
                preferences.timeFormat(), preferences.numberFormat(), false, preferences.theme(),
                preferences.landingPage(), preferences.defaultOrderType());

        channels.add(NotificationChannel.SMS);

        assertEquals(EnumSet.of(NotificationChannel.EMAIL), custom.channels());
        assertThrows(UnsupportedOperationException.class, () -> custom.channels().clear());
    }

    @Test
    void nullSetsBecomeEmptyOnes() {
        CustomerPreferences preferences = new CustomerPreferences(
                "USD", null, null, DateFormatOption.MON_DD_YYYY, TimeFormatOption.H12, NumberFormatOption.US, false,
                ThemeOption.SYSTEM, LandingPage.DASHBOARD, OrderTypeOption.MARKET);

        assertTrue(preferences.channels().isEmpty());
        assertTrue(preferences.categories().isEmpty());
    }

    @Test
    void theDefaultsKeepTheApplicationLookingAsItDidBeforeAndAreQuiet() {
        CustomerPreferences defaults = CustomerPreferences.defaults("INR");

        assertEquals("INR", defaults.preferredCurrency());
        assertEquals(EnumSet.of(NotificationChannel.IN_APP), defaults.channels());
        assertEquals(DateFormatOption.MON_DD_YYYY, defaults.dateFormat(), "Oct 6, 2026, the format used so far");
        assertEquals(TimeFormatOption.H12, defaults.timeFormat());
        assertEquals(NumberFormatOption.US, defaults.numberFormat());
        assertFalse(defaults.aiAssistantEnabled(), "no chatbot icon until it is switched on");
    }

    @Test
    void everyEnumValueIsAllowedByTheDatabaseConstraintsAndNothingElseIs() throws IOException {
        String sql;
        try (var stream = getClass().getClassLoader().getResourceAsStream("preferences-schema.sql")) {
            assertNotNull(stream);
            sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }

        for (DateFormatOption option : DateFormatOption.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
        for (TimeFormatOption option : TimeFormatOption.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
        for (NumberFormatOption option : NumberFormatOption.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
        for (ThemeOption option : ThemeOption.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
        for (LandingPage option : LandingPage.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
        for (OrderTypeOption option : OrderTypeOption.values()) {
            assertTrue(sql.contains("'" + option.name() + "'"), option.name());
        }
    }

    @Test
    void theSupportedCurrenciesIncludeTheOnesTheExamplesName() {
        assertTrue(SupportedCurrencies.isSupported("USD"));
        assertTrue(SupportedCurrencies.isSupported("EUR"));
        assertTrue(SupportedCurrencies.isSupported("INR"));
        assertFalse(SupportedCurrencies.isSupported("usd"));
        assertFalse(SupportedCurrencies.isSupported("XXX"));
        assertFalse(SupportedCurrencies.isSupported(null));
    }
}
