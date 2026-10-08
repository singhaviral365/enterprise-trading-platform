package org.example.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.backend.entities.Instrument;

import java.util.List;
import java.util.Optional;

public interface InstrumentMapper {

    Optional<Instrument> selectInstrumentById(
            @Param("instrumentId") int instrumentId);

    List<Instrument> selectTradableInstruments();

    List<String> selectSymbolsForMarketPolling();

    /**
     * Tradable symbols that appear on at least one customer watchlist, so they get priced even
     * when nobody holds them or has an open order on them. Read-only.
     */
    List<String> selectWatchlistSymbolsForMarketPolling();

    /**
     * Tradable symbols that have a strategy waiting on them (ACTIVE, or EXECUTING), so a strategy on an instrument nobody
     * holds is still priced. Read-only.
     */
    List<String> selectStrategySymbolsForMarketPolling();
}

