package org.example.backend.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.dto.PositionResponse;
import org.example.backend.entities.Holding;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Mapper
public interface HoldingMapper {

    int insertHolding(
            @Param("holding") Holding holding);

    Optional<Holding> selectHoldingById(
            @Param("holdingId") long holdingId);

    Optional<Holding> selectHoldingByAccountAndInstrument(
            @Param("accountId") int accountId,
            @Param("instrumentId") int instrumentId);

    List<Holding> selectHoldingsByAccountId(
            @Param("accountId") int accountId);

    List<Holding> selectHoldingsByInstrumentId(
            @Param("instrumentId") int instrumentId);

    List<Holding> selectActiveHoldingsByAccountId(
            @Param("accountId") int accountId);

    int updateHoldingQuantity(
            @Param("holdingId") long holdingId,
            @Param("newQuantity") long newQuantity);

    int updateHoldingQuantityAndPrice(
            @Param("holdingId") long holdingId,
            @Param("newQuantity") long newQuantity,
            @Param("newPurchasePrice") BigDecimal newPurchasePrice);

    int deleteHoldingById(
            @Param("holdingId") long holdingId);

    long countHoldingsByAccountId(
            @Param("accountId") int accountId);

    long countActiveHoldingsByAccountId(
            @Param("accountId") int accountId);

    boolean holdingExists(
            @Param("accountId") int accountId,
            @Param("instrumentId") int instrumentId);

    /*
     * Story 6:
     * Position response.
     */
    List<PositionResponse> selectPositionResponsesByAccountId(
            @Param("accountId") long accountId);

    /*
     * Story 5:
     * Get a new holding ID from the PostgreSQL identity sequence.
     */
    long nextHoldingId();
}