package org.example.backend.signals.indicator;

import java.util.List;

/**
 * The two textbook indicators the signal is built from, as plain functions of a list of closing prices (oldest first).
 *
 * <p>They are written out here, rather than taken from a library, because they are a handful of lines each, and because the
 * signal is something a customer is told to rely on: every number it shows can be reproduced by hand from the closes.
 */
public final class Indicators {

    private Indicators() {
    }

    /**
     * Simple moving average of the last {@code period} closes.
     *
     * @throws IllegalArgumentException if there are fewer closes than the period
     */
    public static double sma(List<Double> closes, int period) {
        if (period < 1) {
            throw new IllegalArgumentException("Period must be at least 1");
        }
        if (closes.size() < period) {
            throw new IllegalArgumentException("Need " + period + " closes, have " + closes.size());
        }
        double sum = 0;
        for (int i = closes.size() - period; i < closes.size(); i++) {
            sum += closes.get(i);
        }
        return sum / period;
    }

    /**
     * Relative Strength Index with Wilder's smoothing, 0 to 100. The first average gain and loss are the plain means of the
     * first {@code period} changes; each later one is {@code (previous * (period - 1) + current) / period}.
     * A run of closes that never fell is 100, one that never rose is 0, and one that never moved is 50.
     *
     * @throws IllegalArgumentException if there are fewer than {@code period + 1} closes
     */
    public static double rsi(List<Double> closes, int period) {
        if (period < 1) {
            throw new IllegalArgumentException("Period must be at least 1");
        }
        if (closes.size() < period + 1) {
            throw new IllegalArgumentException("Need " + (period + 1) + " closes, have " + closes.size());
        }

        double gain = 0;
        double loss = 0;
        for (int i = 1; i <= period; i++) {
            double change = closes.get(i) - closes.get(i - 1);
            gain += Math.max(change, 0);
            loss += Math.max(-change, 0);
        }
        double avgGain = gain / period;
        double avgLoss = loss / period;

        for (int i = period + 1; i < closes.size(); i++) {
            double change = closes.get(i) - closes.get(i - 1);
            avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
        }

        if (avgLoss == 0) {
            return avgGain == 0 ? 50 : 100;
        }
        double rs = avgGain / avgLoss;
        return 100 - 100 / (1 + rs);
    }
}
