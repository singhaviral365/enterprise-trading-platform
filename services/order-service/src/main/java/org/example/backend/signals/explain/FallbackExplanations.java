package org.example.backend.signals.explain;

import org.example.backend.signals.model.SignalDirection;
import org.example.backend.signals.model.TradeSignal;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The words the platform uses when the language model is not configured, is busy, or fails. They are built from the same
 * numbers, in a fixed shape, so a customer always gets an explanation that matches the signal, only less conversational. They
 * say what the indicators show and never tell the customer to trade.
 */
public final class FallbackExplanations {

    private FallbackExplanations() {
    }

    /** One or two sentences on why the signal is what it is. */
    public static String explain(TradeSignal signal) {
        String averages = "The 20-day average (" + price(signal.sma20()) + ") is "
                + relation(signal.sma20().compareTo(signal.sma50())) + " the 50-day average (" + price(signal.sma50())
                + ") and the latest close (" + price(signal.price()) + ") is "
                + relation(signal.price().compareTo(signal.sma20())) + " the 20-day average";

        String reading = switch (signal.direction()) {
            case BUY -> averages + ", which this method reads as an upward trend. ";
            case SELL -> averages + ", which this method reads as a downward trend. ";
            case HOLD -> averages + ", so the two do not agree on a trend and this method reads it as neutral. ";
        };
        return reading + "The RSI is " + signal.rsi().setScale(1, RoundingMode.HALF_UP).toPlainString()
                + ", which is " + rsiZone(signal) + ".";
    }

    /** What the chat says when it cannot reach the model: why, and then what the indicators show. */
    public static String chatReply(TradeSignal signal, String why) {
        return why + " Here is what the indicators show. " + explain(signal);
    }

    static String rsiZone(TradeSignal signal) {
        BigDecimal rsi = signal.rsi();
        if (rsi.compareTo(BigDecimal.valueOf(70)) >= 0) {
            return "in the range usually called overbought (70 or more)";
        }
        if (rsi.compareTo(BigDecimal.valueOf(30)) <= 0) {
            return "in the range usually called oversold (30 or less)";
        }
        return "in the middle range, neither overbought nor oversold";
    }

    private static String relation(int comparison) {
        return comparison > 0 ? "above" : comparison < 0 ? "below" : "equal to";
    }

    private static String price(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    /** The same direction in words, for the places that need a label. */
    public static String label(SignalDirection direction) {
        return switch (direction) {
            case BUY -> "Buy signal";
            case SELL -> "Sell signal";
            case HOLD -> "Hold signal";
        };
    }
}
