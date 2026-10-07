package org.example.backend.watchlist.alert;

import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertWatch;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PriceAlertIndexTest {

    private final PriceAlertIndex index = new PriceAlertIndex();

    private static AlertWatch watch(long watchlistId, String symbol, String target) {
        return new AlertWatch(watchlistId, symbol, AlertDirection.ABOVE, new BigDecimal(target));
    }

    @Test
    void aSymbolIsFoundWhateverTheCase() {
        index.put(watch(1, "aapl", "200"));

        assertEquals(1, index.candidates("AAPL").size());
        assertEquals(1, index.candidates(" Aapl ").size());
    }

    @Test
    void aSymbolWithNoAlertsHasNoCandidates() {
        assertTrue(index.candidates("MSFT").isEmpty());
        assertEquals(0, index.size());
    }

    @Test
    void settingAnAlertOnTheSameEntryReplacesItRatherThanAddingASecond() {
        index.put(watch(1, "AAPL", "200"));
        index.put(watch(1, "AAPL", "210"));

        assertEquals(1, index.size());
        assertEquals(new BigDecimal("210"), index.candidates("AAPL").get(0).targetPrice());
    }

    @Test
    void removingTheLastAlertOnASymbolForgetsTheSymbol() {
        index.put(watch(1, "AAPL", "200"));
        index.put(watch(2, "AAPL", "205"));

        index.remove(1, "AAPL");
        assertEquals(1, index.candidates("AAPL").size());
        index.remove(2, "AAPL");

        assertEquals(0, index.size());
        index.remove(2, "AAPL");
    }

    @Test
    void theSnapshotIsNotAffectedByLaterChanges() {
        index.put(watch(1, "AAPL", "200"));
        var snapshot = index.candidates("AAPL");

        index.remove(1, "AAPL");

        assertEquals(1, snapshot.size());
    }
}
