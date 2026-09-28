package org.example.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.backend.entities.Instrument;

import java.util.List;
import java.util.Optional;

public interface InstrumentMapper {

    Optional<Instrument> selectInstrumentById(
            @Param("instrumentId") int instrumentId);

    List<String> selectSymbolsForMarketPolling();
}

