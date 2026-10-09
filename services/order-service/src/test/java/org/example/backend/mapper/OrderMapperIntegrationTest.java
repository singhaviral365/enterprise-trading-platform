package org.example.backend.mapper;

import org.example.backend.entities.Account;
import org.example.backend.entities.Order;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.support.PostgresIntegrationSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class OrderMapperIntegrationTest extends PostgresIntegrationSupport {

    @Autowired
    private OrderMapper orderMapper;

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private OffsetDateTime receivedAt;

    @BeforeEach
    void setUp() {
        resetSchema(jdbcTemplate);
        jdbcTemplate.update("INSERT INTO client (client_id, client_name) VALUES (11, 'Priya Menon')");
        accountMapper.insertAccount(new Account(
                1001,
                "ACC-001001",
                LocalDate.of(2024, 1, 1),
                new BigDecimal("50000.00"),
                new BigDecimal("50000.00"),
                AccountStatus.ACTIVE,
                "USD",
                1L,
                null,
                null,
                11));
        jdbcTemplate.update("INSERT INTO instrument (instrument_id, instrument_ticker, instrument_name, asset_class, instrument_status) VALUES (101, 'ACME', 'Acme Corp', 'EQUITY', 'TRADING')");
        receivedAt = OffsetDateTime.parse("2026-09-10T09:14:22Z");
    }

    @Test
    void insertAndReadByIdWorks() {
        long orderId = orderMapper.nextOrderId();
        Order order = new Order(orderId, "idem-1001", OrderStatus.NEW, receivedAt, OrderSide.BUY,
                OrderPricingType.LIMIT, new BigDecimal("25.50"), 100L, null, 1001, 101);

        assertEquals(1, orderMapper.insertOrder(order));

        Optional<Order> found = orderMapper.selectOrderById(orderId);
        assertTrue(found.isPresent());
        assertEquals("idem-1001", found.get().getIdempotencyKey());
        assertEquals(OrderStatus.NEW, found.get().getOrderStatus());
        assertEquals(OrderPricingType.LIMIT, found.get().getPricingType());
    }

    @Test
    void statusFilterReturnsOnlyMatchingOrders() {
        long newOrderId = orderMapper.nextOrderId();
        long filledOrderId = orderMapper.nextOrderId();

        orderMapper.insertOrder(new Order(newOrderId, "idem-new", OrderStatus.NEW, receivedAt,
                OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("25.00"), 10L, null, 1001, 101));
        orderMapper.insertOrder(new Order(filledOrderId, "idem-filled", OrderStatus.FILLED, receivedAt.plusMinutes(1),
                OrderSide.SELL, OrderPricingType.LIMIT, new BigDecimal("26.00"), 5L, receivedAt.plusMinutes(1), 1001, 101));

        List<Order> newOrders = orderMapper.selectOrdersByAccountIdAndStatus(1001, OrderStatus.NEW);
        assertEquals(1, newOrders.size());
        assertEquals("idem-new", newOrders.get(0).getIdempotencyKey());
    }

    @Test
    void duplicateIdempotencyKeyRaisesConstraintViolation() {
        long orderId1 = orderMapper.nextOrderId();
        long orderId2 = orderMapper.nextOrderId();

        orderMapper.insertOrder(new Order(orderId1, "idem-dup", OrderStatus.NEW, receivedAt,
                OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("25.00"), 10L, null, 1001, 101));

        assertThrows(DataIntegrityViolationException.class,
                () -> orderMapper.insertOrder(new Order(orderId2, "idem-dup", OrderStatus.NEW, receivedAt,
                        OrderSide.BUY, OrderPricingType.LIMIT, new BigDecimal("26.00"), 12L, null, 1001, 101)));
    }
}
