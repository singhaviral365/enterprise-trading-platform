package org.example.backend.portfolio.dto;

import java.math.BigDecimal;

/** {@code SymbolPnl} in {@code contracts/portfolio-api.yaml}. */
public record SymbolPnl(String symbol, BigDecimal realisedPnl, BigDecimal unrealisedPnl, BigDecimal totalPnl) {
}
