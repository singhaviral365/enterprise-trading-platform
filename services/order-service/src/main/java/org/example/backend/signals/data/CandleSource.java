package org.example.backend.signals.data;

import java.time.LocalDate;
import java.util.List;

/**
 * Where the signals module gets daily closes. A seam, so the cache and the service are tested without a network.
 *
 * <p>It is the signals module's own, on purpose. The portfolio module has a candle source too, but nothing outside the portfolio
 * module may depend on it (the portfolio is kept independent so it can be changed or removed alone), so this one is separate, and
 * only the Fauxnance address and key are shared, as environment values.
 */
public interface CandleSource {

    /**
     * Daily candles for {@code symbol} between {@code from} and {@code to}, both inclusive, oldest first. A symbol Fauxnance does
     * not know gives an empty list.
     *
     * @throws CandleSourceException when the call cannot be completed (not configured, unreachable, quota)
     */
    List<Candle> fetch(String symbol, LocalDate from, LocalDate to);
}
