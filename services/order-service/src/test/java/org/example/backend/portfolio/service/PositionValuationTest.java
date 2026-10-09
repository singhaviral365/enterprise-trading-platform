package org.example.backend.portfolio.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class PositionValuationTest {

    @Test
    void costBasisAndMarketValueAreQuantityTimesPriceRoundedToTwoPlaces() {
        assertEquals(new BigDecimal("2284.00"), PositionValuation.costBasis(10, new BigDecimal("228.40")));
        assertEquals(new BigDecimal("2327.10"), PositionValuation.marketValue(10, new BigDecimal("232.71")));
        assertEquals(new BigDecimal("0.34"), PositionValuation.marketValue(3, new BigDecimal("0.1133")));
    }

    @Test
    void dayPnlIsTheMoveFromThePreviousCloseAndNullWhenThatIsUnknown() {
        assertEquals(new BigDecimal("25.00"),
                PositionValuation.dayPnl(10, new BigDecimal("102.50"), new BigDecimal("100.00")));
        assertEquals(new BigDecimal("-25.00"),
                PositionValuation.dayPnl(10, new BigDecimal("97.50"), new BigDecimal("100.00")));
        assertNull(PositionValuation.dayPnl(10, new BigDecimal("102.50"), null), "unknown is not zero");
    }

    @Test
    void aPercentageIsTwoPlacesAndNullWithNothingToCompareWith() {
        assertEquals(new BigDecimal("6.23"), PositionValuation.percent(new BigDecimal("3820.00"), new BigDecimal("61300.00")));
        assertNull(PositionValuation.percent(new BigDecimal("5.00"), BigDecimal.ZERO), "no cost basis, no percentage");
        assertNull(PositionValuation.percent(null, new BigDecimal("100")));
    }
}
