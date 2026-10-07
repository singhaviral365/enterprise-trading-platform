package org.example.backend.portfolio.dto;

import java.math.BigDecimal;

/** {@code SymbolRealised} in {@code contracts/portfolio-api.yaml} (a team extension): realised profit and loss for one instrument. */
public record RealisedBySymbol(String symbol, BigDecimal realisedPnl) {
}
