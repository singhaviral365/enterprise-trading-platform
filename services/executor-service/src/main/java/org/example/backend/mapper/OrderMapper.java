package org.example.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.backend.entities.Order;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;

public interface OrderMapper {

    Optional<Order> selectOrderById(
        @Param("orderId") long orderId);

    int rejectOrderIfNew(
        @Param("orderId") long orderId,
        @Param("transactionDate") OffsetDateTime rejectedAt);

    int fillOrderIfNew(
        @Param("orderId") long orderId,
        @Param("executionPrice") BigDecimal executionPrice,
        @Param("transactionDate") OffsetDateTime filledAt);
}

