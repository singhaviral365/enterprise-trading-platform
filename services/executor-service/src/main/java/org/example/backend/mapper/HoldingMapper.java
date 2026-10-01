package org.example.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.backend.entities.Holding;

import java.util.Optional;

public interface HoldingMapper {

        Optional<Holding> selectHoldingByAccountAndInstrument(
            @Param("accountId") int accountId,
            @Param("instrumentId") int instrumentId);

    long nextHoldingId();

    int insertHolding(Holding holding);

        int updateHoldingQuantity(
            @Param("holdingId") long holdingId,
            @Param("quantity") long quantity);

        int updateHoldingQuantityAndPrice(
            @Param("holdingId") long holdingId,
            @Param("quantity") long quantity,
            @Param("purchasePrice") java.math.BigDecimal purchasePrice);
}

