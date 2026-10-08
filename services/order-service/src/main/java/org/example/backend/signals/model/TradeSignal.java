package org.example.backend.signals.model;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The platform's reading of one instrument from its daily closes: the moving averages, the RSI, and the direction and
 * strength they add up to. Every field can be reproduced by hand from the closes it was computed from.
 *
 * @param strength 0 to 100. For BUY and SELL, how strongly the trend and the momentum agree; for HOLD, how balanced the
 *                 indicators are (see {@code SignalComputer})
 * @param price    the latest close
 * @param asOf     the date of the latest close
 * @param sessions how many trading days of closes the averages were taken from
 */
public record TradeSignal(
        SignalDirection direction,
        int strength,
        SmaStatus smaStatus,
        BigDecimal sma20,
        BigDecimal sma50,
        BigDecimal price,
        BigDecimal rsi,
        LocalDate asOf,
        int sessions) {
}
