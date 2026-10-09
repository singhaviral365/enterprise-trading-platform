package org.example.backend.portfolio.performance;

import java.time.LocalDate;
import java.util.List;

/** Where daily candles come from. A seam so the store, the replay and the job are tested without a network. */
public interface CandleSource {

    /**
     * Daily candles for {@code symbol} between {@code from} and {@code to}, both inclusive, oldest first; at most ten years.
     * A symbol Fauxnance does not know gives an empty list.
     *
     * @throws CandleSourceException when the call cannot be completed (not configured, unreachable, quota, not ready)
     */
    List<DailyCandle> fetch(String symbol, LocalDate from, LocalDate to);
}
