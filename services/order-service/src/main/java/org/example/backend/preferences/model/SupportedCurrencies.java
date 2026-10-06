package org.example.backend.preferences.model;

import java.util.List;

/**
 * The currencies a customer can pick as their display currency. A fixed list keeps the settings screen a short
 * dropdown and means a typo can never be stored; the exchange-rate service quotes every one of them.
 */
public final class SupportedCurrencies {

    public static final List<String> CODES =
            List.of("USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "SGD", "CNY");

    private SupportedCurrencies() {
    }

    public static boolean isSupported(String code) {
        return code != null && CODES.contains(code);
    }
}
