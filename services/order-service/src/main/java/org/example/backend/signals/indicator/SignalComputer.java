package org.example.backend.signals.indicator;

import org.example.backend.signals.exceptions.InsufficientHistoryException;
import org.example.backend.signals.model.SignalDirection;
import org.example.backend.signals.model.SmaStatus;
import org.example.backend.signals.model.TradeSignal;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns daily closes into a {@link TradeSignal}. One method, a few rules, nothing hidden.
 *
 * <p><b>Direction</b>
 * <ul>
 *   <li>BUY: SMA(20) is above SMA(50) and the latest close is above SMA(20);</li>
 *   <li>SELL: SMA(20) is below SMA(50) and the latest close is below SMA(20);</li>
 *   <li>HOLD: anything else.</li>
 * </ul>
 *
 * <p><b>Strength</b>, 0 to 100, from the two indicators equally.
 * <ul>
 *   <li><i>Trend</i>: how far apart the averages are, as a share of SMA(50), where a gap of 3% or more counts in full.</li>
 *   <li><i>Momentum</i> (RSI): for a BUY, an RSI from 40 to 65 counts in full (rising, not stretched); below 40 it is scaled
 *       down (little momentum behind it), and above 65 it is scaled down towards 0 at an RSI of 100 (stretched, so likelier
 *       to pull back). For a SELL the same is applied to 100 minus the RSI.</li>
 *   <li>For HOLD the strength is how balanced the indicators are, {@code 100 - 2 * |RSI - 50|}: 100 at an RSI of 50, 0 at 0
 *       or 100.</li>
 * </ul>
 *
 * It needs 50 closes, which the longer average requires and which also covers the 15 the RSI needs.
 */
@Component
public class SignalComputer {

    public static final int SHORT_PERIOD = 20;
    public static final int LONG_PERIOD = 50;
    public static final int RSI_PERIOD = 14;
    /** The fewest closes a signal can be computed from. */
    public static final int MIN_CLOSES = LONG_PERIOD;

    private static final double FULL_TREND_GAP_PERCENT = 3.0;
    private static final double MOMENTUM_LOW = 40.0;
    private static final double MOMENTUM_HIGH = 65.0;

    /**
     * @param closes closing prices, oldest first
     * @param asOf   the date of the last close
     * @throws InsufficientHistoryException if there are fewer than {@link #MIN_CLOSES} closes
     */
    public TradeSignal compute(List<BigDecimal> closes, LocalDate asOf) {
        if (closes == null || closes.size() < MIN_CLOSES) {
            throw new InsufficientHistoryException(closes == null ? 0 : closes.size(), MIN_CLOSES);
        }

        List<Double> series = new ArrayList<>(closes.size());
        for (BigDecimal close : closes) {
            series.add(close.doubleValue());
        }

        double sma20 = Indicators.sma(series, SHORT_PERIOD);
        double sma50 = Indicators.sma(series, LONG_PERIOD);
        double rsi = Indicators.rsi(series, RSI_PERIOD);
        double price = series.get(series.size() - 1);

        SignalDirection direction = direction(price, sma20, sma50);
        SmaStatus smaStatus = sma20 > sma50 ? SmaStatus.BULLISH : sma20 < sma50 ? SmaStatus.BEARISH : SmaStatus.FLAT;

        return new TradeSignal(
                direction,
                strength(direction, sma20, sma50, rsi),
                smaStatus,
                scaled(sma20),
                scaled(sma50),
                closes.get(closes.size() - 1).setScale(4, RoundingMode.HALF_UP),
                BigDecimal.valueOf(rsi).setScale(2, RoundingMode.HALF_UP),
                asOf,
                closes.size());
    }

    static SignalDirection direction(double price, double sma20, double sma50) {
        if (sma20 > sma50 && price > sma20) {
            return SignalDirection.BUY;
        }
        if (sma20 < sma50 && price < sma20) {
            return SignalDirection.SELL;
        }
        return SignalDirection.HOLD;
    }

    static int strength(SignalDirection direction, double sma20, double sma50, double rsi) {
        if (direction == SignalDirection.HOLD) {
            return clamp(100 - 2 * Math.abs(rsi - 50));
        }
        double gapPercent = Math.abs(sma20 - sma50) / sma50 * 100;
        double trend = Math.min(1.0, gapPercent / FULL_TREND_GAP_PERCENT);
        double momentum = momentum(direction == SignalDirection.BUY ? rsi : 100 - rsi);
        return clamp(100 * (0.5 * trend + 0.5 * momentum));
    }

    /** 1 for a reading in the healthy range, less either side of it. */
    private static double momentum(double reading) {
        if (reading < MOMENTUM_LOW) {
            return Math.max(0, reading / MOMENTUM_LOW);
        }
        if (reading > MOMENTUM_HIGH) {
            return Math.max(0, (100 - reading) / (100 - MOMENTUM_HIGH));
        }
        return 1.0;
    }

    private static int clamp(double value) {
        return (int) Math.max(0, Math.min(100, Math.round(value)));
    }

    private static BigDecimal scaled(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP);
    }
}
