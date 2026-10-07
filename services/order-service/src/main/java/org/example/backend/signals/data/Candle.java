package org.example.backend.signals.data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One trading day of one instrument: the date and the close the averages are taken over. */
public record Candle(LocalDate date, BigDecimal close, boolean synthetic) {
}
