package org.example.backend.portfolio.model;

import java.math.BigDecimal;

/** Realised profit and loss summed for one instrument. */
public record SymbolRealised(String tickerSymbol, BigDecimal realisedPnl) {
}
