package org.example.backend.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.dto.OrderHistoryEntry;
import org.example.backend.entities.Order;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface OrderMapper {

    int insertOrder(
            @Param("order") Order order);

    Optional<Order> selectOrderById(
            @Param("orderId") long orderId);

    Optional<Order> selectOrderByIdempotencyKey(
            @Param("idempotencyKey") String idempotencyKey);

    List<Order> selectOrdersByAccountId(
            @Param("accountId") int accountId);

    List<Order> selectOrdersByAccountIdAndStatus(
            @Param("accountId") int accountId,
            @Param("orderStatus") OrderStatus orderStatus);

    List<Order> selectOrdersByStatus(
            @Param("orderStatus") OrderStatus orderStatus);

    List<Order> selectOrdersByInstrumentId(
            @Param("instrumentId") int instrumentId);

    List<Order> selectOrdersByReceivedDateRange(
            @Param("fromDate") OffsetDateTime fromDate,
            @Param("toDate") OffsetDateTime toDate);

    int updateOrderStatus(
            @Param("orderId") long orderId,
            @Param("newStatus") OrderStatus newStatus);

    int updateOrderStatusAndDate(
            @Param("orderId") long orderId,
            @Param("newStatus") OrderStatus newStatus,
            @Param("transactionDate") OffsetDateTime transactionDate);

    int fillOrderIfNew(
            @Param("orderId") long orderId,
            @Param("executionPrice") BigDecimal executionPrice,
            @Param("transactionDate") OffsetDateTime transactionDate);

    int rejectOrderIfNew(
            @Param("orderId") long orderId,
            @Param("transactionDate") OffsetDateTime transactionDate);

    long countOrdersByAccountId(
            @Param("accountId") int accountId);

    long countOrdersByStatus(
            @Param("orderStatus") OrderStatus orderStatus);

    List<Order> selectRecentOrdersByAccountId(
            @Param("accountId") int accountId,
            @Param("limit") int limit);

    List<Order> selectOrdersByAccountIdAndSide(
            @Param("accountId") int accountId,
            @Param("orderSide") OrderSide orderSide);

    /*
     * Story 6:
     * Order history with optional filters.
     */
    List<OrderHistoryEntry> selectOrderHistoryByAccountId(
            @Param("accountId") long accountId,
            @Param("status") OrderStatus status,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to);

    /*
     * Story 5:
     * PostgreSQL order ID generation.
     */
    long nextOrderId();

    /*
     * Story 5:
     * Conditional cancellation.
     *
     * The UPDATE itself checks that the order is still NEW.
     */
    int cancelOrder(
            @Param("orderId") long orderId,
            @Param("accountId") long accountId);
}