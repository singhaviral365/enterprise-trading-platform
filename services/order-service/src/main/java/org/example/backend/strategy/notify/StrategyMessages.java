package org.example.backend.strategy.notify;

import org.example.backend.enums.OrderSide;
import org.example.backend.notifications.consumer.OrderOutcomeMessages;
import org.example.backend.notifications.consumer.StrategyOrderNotices.Notice;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.TriggerDirection;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The words a customer reads about their strategies. A strategy notice is worded differently from an ordinary order notice
 * on purpose: it opens with the strategy ("Strategy #12 ...") and says what rule fired, so the customer knows the
 * platform acted for them and why. Plain text built only from the strategy's own fields and a fixed set of reasons.
 */
public final class StrategyMessages {

    static final String FILLED = "ORDER_FILLED";
    static final String REJECTED = "ORDER_REJECTED";
    static final String CANCELLED = "ORDER_CANCELLED";

    private StrategyMessages() {
    }

    /** The rule in a phrase: "buy 50 AAPL when the price is at or below 150.00". */
    public static String describe(Strategy strategy) {
        return verb(strategy.side()) + " " + strategy.quantity() + " " + strategy.tickerSymbol()
                + " when the price is at or " + direction(strategy.direction()) + " " + price(strategy.triggerPrice());
    }

    public static Notice forOrderOutcome(Strategy strategy, String eventType, BigDecimal executionPrice, String reason) {
        String name = "Strategy #" + strategy.strategyId();
        String what = verb(strategy.side()) + " " + strategy.quantity() + " " + strategy.tickerSymbol();
        return switch (eventType) {
            case FILLED -> new Notice(
                    "Strategy executed",
                    name + " " + pastVerb(strategy.side()) + " " + strategy.quantity() + " " + strategy.tickerSymbol()
                            + (executionPrice == null ? "" : " at " + price(executionPrice))
                            + " after the price reached your trigger of " + price(strategy.triggerPrice()) + ".");
            case REJECTED -> new Notice(
                    "Strategy order rejected",
                    name + " tried to " + what + ", but the order was rejected: " + OrderOutcomeMessages.reasonText(reason) + ".");
            case CANCELLED -> new Notice(
                    "Strategy order cancelled",
                    "The order strategy #" + strategy.strategyId() + " placed to " + what + " was cancelled.");
            default -> throw new IllegalArgumentException("Not an order outcome: " + eventType);
        };
    }

    public static Notice forStopped(Strategy strategy) {
        return new Notice(
                "Strategy stopped",
                "Strategy #" + strategy.strategyId() + " (" + describe(strategy) + ") was stopped after "
                        + strategy.maxFailures() + " failed attempts in a row. It will place no more orders.");
    }

    public static Notice forExpired(Strategy strategy) {
        return new Notice(
                "Strategy expired",
                "Strategy #" + strategy.strategyId() + " (" + describe(strategy)
                        + ") reached the end of its window before it finished and is no longer active.");
    }

    private static String verb(OrderSide side) {
        return side == OrderSide.BUY ? "buy" : "sell";
    }

    private static String pastVerb(OrderSide side) {
        return side == OrderSide.BUY ? "bought" : "sold";
    }

    private static String direction(TriggerDirection direction) {
        return direction == TriggerDirection.BELOW ? "below" : "above";
    }

    /** Two decimals, or up to four when the price really has them. */
    static String price(BigDecimal value) {
        int scale = Math.max(2, Math.min(4, value.stripTrailingZeros().scale()));
        return value.setScale(scale, RoundingMode.HALF_UP).toPlainString();
    }
}
