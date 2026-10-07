package org.example.backend.notifications.consumer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.Map;

/**
 * The words a customer reads for an order outcome. Plain text, built only from the order's own fields (side, quantity,
 * symbol, price, and a reason from a fixed set). Nothing the event contract prohibits ever reaches it, and a reason the
 * platform does not know is replaced by a generic sentence rather than echoed.
 */
final class OrderOutcomeMessages {

    static final String FILLED = "ORDER_FILLED";
    static final String REJECTED = "ORDER_REJECTED";
    static final String CANCELLED = "ORDER_CANCELLED";

    private static final Map<String, String> REJECT_REASONS = Map.of(
            "OUTSIDE_MARKETABLE_RANGE", "the price was outside the range it could be filled at",
            "PRICE_UNAVAILABLE", "no price was available for the instrument",
            "INSTRUMENT_NOT_TRADABLE", "the instrument is not tradable right now",
            "ACCOUNT_NOT_ACTIVE", "your account is not active",
            "INSUFFICIENT_FUNDS", "you did not have enough cash",
            "INSUFFICIENT_HOLDINGS", "you did not hold enough shares",
            "FX_RATE_UNAVAILABLE", "a currency exchange rate was not available");

    private OrderOutcomeMessages() {
    }

    static boolean handles(String eventType) {
        return FILLED.equals(eventType) || REJECTED.equals(eventType) || CANCELLED.equals(eventType);
    }

    static String title(String eventType) {
        return switch (eventType) {
            case FILLED -> "Order filled";
            case REJECTED -> "Order rejected";
            case CANCELLED -> "Order cancelled";
            default -> throw new IllegalArgumentException("Not an order outcome: " + eventType);
        };
    }

    static String message(String eventType, String side, long quantity, String symbol, BigDecimal price, String reason) {
        String what = "Your " + (side == null ? "" : side.toLowerCase(Locale.ROOT) + " ") + "order for "
                + quantity + " " + symbol;
        return switch (eventType) {
            case FILLED -> what + " was filled" + (price == null ? "" : " at " + plain(price)) + ".";
            case REJECTED -> what + " was rejected: " + reasonText(reason) + ".";
            case CANCELLED -> what + " was cancelled.";
            default -> throw new IllegalArgumentException("Not an order outcome: " + eventType);
        };
    }

    static String reasonText(String reason) {
        return reason == null ? "it could not be executed" : REJECT_REASONS.getOrDefault(reason, "it could not be executed");
    }

    private static String plain(BigDecimal price) {
        return price.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
