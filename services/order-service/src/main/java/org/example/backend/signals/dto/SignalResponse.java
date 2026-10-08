package org.example.backend.signals.dto;

import org.example.backend.signals.model.SignalDirection;
import org.example.backend.signals.model.SmaStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A signal as the customer sees it. {@code explanation} is present only when the narrative was asked for;
 * {@code explanationSource} says whether the language model or the platform's own words produced it.
 *
 * @param cacheAge seconds since the price history the signal was computed from was fetched
 * @param stale    the history could not be refreshed and is older than it should be
 */
public record SignalResponse(
        String symbol,
        SignalDirection direction,
        int strength,
        SmaStatus smaStatus,
        BigDecimal sma20,
        BigDecimal sma50,
        BigDecimal price,
        BigDecimal rsiValue,
        LocalDate asOf,
        int sessions,
        OffsetDateTime timestamp,
        long cacheAge,
        boolean stale,
        String explanation,
        String explanationSource,
        String methodology,
        String disclaimer) {

    public static final String METHODOLOGY = "Signals come from a 20-day and a 50-day simple moving average and a 14-day RSI "
            + "on daily closing prices. BUY: the 20-day average is above the 50-day and the price is above the 20-day. "
            + "SELL: the reverse. HOLD: neither.";

    public static final String DISCLAIMER = "For information only. This is not investment advice, a recommendation or an "
            + "offer, and past price movements do not predict future ones. You can lose money.";
}
