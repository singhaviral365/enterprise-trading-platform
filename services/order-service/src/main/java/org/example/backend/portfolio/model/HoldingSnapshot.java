package org.example.backend.portfolio.model;

import java.math.BigDecimal;

/**
 * What the {@code holdings} table says an account holds of one instrument right now: the quantity (zero after everything
 * was sold: the executor leaves the row) and the weighted average cost, in the account currency. Read-only: the ledger
 * uses it to account for a position that existing orders do not explain, such as a holding that was seeded.
 */
public record HoldingSnapshot(String tickerSymbol, long quantity, BigDecimal averageCost) {
}
