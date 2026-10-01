package org.example.backend.characterization.sprint6;

import org.example.backend.dto.OrderResponse;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.service.TradeService;
import org.example.backend.support.PostgresIntegrationSupport;
import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
// @Disabled("Requires Docker-enabled Postgres test environment")
class OrderPlacementPersistenceCharacterizationTest extends PostgresIntegrationSupport {

    @Autowired
    private TradeService tradeService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        resetSchema(jdbcTemplate);
    }

    @Test
    void acceptedOrderWritesCurrentOrderCashAndPositionValues() {
        seedClient(1, "Priya Menon");
        seedAccount(1, "ACC-000001", new BigDecimal("25000.00"), 1L, 1);
        seedInstrument(101, "ACME", "Acme Corp");

        OrderResponse response = tradeService.placeOrder(
                1L,
                "ACME",
                OrderSide.BUY,
                OrderPricingType.LIMIT,
                100L,
                new BigDecimal("50.00"),
                "idem-success-1");

        assertAll(
                () -> assertEquals(OrderStatus.NEW, response.status()),
                () -> assertEquals("Order placed successfully", response.message()),
                () -> assertEquals("ACME", response.symbol()),
                () -> assertEquals(OrderSide.BUY, response.side()),
                () -> assertEquals(OrderPricingType.LIMIT, response.orderPricingType()),
                () -> assertEquals(100, response.quantity()),
                () -> assertEquals(new BigDecimal("50.0000"), response.price()),
                () -> assertEquals(new BigDecimal("25000.00"), accountBalance(1)),
                () -> assertEquals(new BigDecimal("25000.00"), purchasingPower(1)),
                () -> assertEquals(1L, accountVersion(1)),
                () -> assertEquals(0, holdingsCountFor(1)),
                () -> assertEquals(1, ordersCountFor(1)),
                () -> assertEquals("idem-success-1", orderIdempotencyKey("idem-success-1")),
                () -> assertEquals("NEW", orderStatus("idem-success-1")),
                () -> assertEquals("BUY", orderSide("idem-success-1")),
                () -> assertEquals("LIMIT", orderPricingType("idem-success-1")),
                () -> assertEquals(0, new BigDecimal("50.00").compareTo(orderPrice("idem-success-1"))),
                () -> assertEquals(100L, orderQuantity("idem-success-1")),
                () -> assertEquals(1, orderAccountId("idem-success-1")),
                () -> assertEquals(101, orderInstrumentId("idem-success-1")));
    }

    private void seedClient(int clientId, String clientName) {
        jdbcTemplate.update(
                "INSERT INTO client (client_id, client_name) VALUES (?, ?)",
                clientId,
                clientName);
    }

    private void seedAccount(
            int accountId,
            String accountNumber,
            BigDecimal balance,
            long version,
            int clientId) {

        jdbcTemplate.update(
                """
                INSERT INTO account (
                    account_id,
                    account_number,
                    opening_date,
                    balance,
                    purchasing_power,
                    account_status,
                    currency,
                    version,
                    suspended_at,
                    closed_at,
                    client_id
                ) VALUES (?, ?, DATE '2024-01-01', ?, ?, 'ACTIVE', 'USD', ?, NULL, NULL, ?)
                """,
                accountId,
                accountNumber,
                balance,
                balance,
                version,
                clientId);
    }

    private void seedInstrument(
            int instrumentId,
            String ticker,
            String name) {

        jdbcTemplate.update(
                """
                INSERT INTO instrument (
                    instrument_id,
                    instrument_ticker,
                    instrument_name,
                    asset_class,
                    instrument_status
                ) VALUES (?, ?, ?, 'EQUITY', 'TRADING')
                """,
                instrumentId,
                ticker,
                name);
    }

    private BigDecimal accountBalance(int accountId) {
        return jdbcTemplate.queryForObject(
                "SELECT balance FROM account WHERE account_id = ?",
                BigDecimal.class,
                accountId);
    }

    private BigDecimal purchasingPower(int accountId) {
        return jdbcTemplate.queryForObject(
                "SELECT purchasing_power FROM account WHERE account_id = ?",
                BigDecimal.class,
                accountId);
    }

    private long accountVersion(int accountId) {
        Long version = jdbcTemplate.queryForObject(
                "SELECT version FROM account WHERE account_id = ?",
                Long.class,
                accountId);
        return version == null ? -1L : version;
    }

    private int holdingsCountFor(int accountId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM holdings WHERE account_id = ?",
                Integer.class,
                accountId);
        return count == null ? -1 : count;
    }

    private long holdingQuantity(int accountId, int instrumentId) {
        Long quantity = jdbcTemplate.queryForObject(
                "SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class,
                accountId,
                instrumentId);
        return quantity == null ? -1L : quantity;
    }

    private BigDecimal holdingPurchasePrice(int accountId, int instrumentId) {
        return jdbcTemplate.queryForObject(
                "SELECT purchase_price FROM holdings WHERE account_id = ? AND instrument_id = ?",
                BigDecimal.class,
                accountId,
                instrumentId);
    }

    private int ordersCountFor(int accountId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM orders WHERE account_id = ?",
                Integer.class,
                accountId);
        return count == null ? -1 : count;
    }

    private String orderStatus(String idempotencyKey) {
        return jdbcTemplate.queryForObject(
                "SELECT order_status FROM orders WHERE idempotency_key = ?",
                String.class,
                idempotencyKey);
    }

    private String orderIdempotencyKey(String idempotencyKey) {
        return jdbcTemplate.queryForObject(
                "SELECT idempotency_key FROM orders WHERE idempotency_key = ?",
                String.class,
                idempotencyKey);
    }

    private String orderSide(String idempotencyKey) {
        return jdbcTemplate.queryForObject(
                "SELECT order_type FROM orders WHERE idempotency_key = ?",
                String.class,
                idempotencyKey);
    }

    private String orderPricingType(String idempotencyKey) {
        return jdbcTemplate.queryForObject(
                "SELECT order_pricing_type FROM orders WHERE idempotency_key = ?",
                String.class,
                idempotencyKey);
    }

    private BigDecimal orderPrice(String idempotencyKey) {
        return jdbcTemplate.queryForObject(
                "SELECT price FROM orders WHERE idempotency_key = ?",
                BigDecimal.class,
                idempotencyKey);
    }

    private long orderQuantity(String idempotencyKey) {
        Long quantity = jdbcTemplate.queryForObject(
                "SELECT quantity FROM orders WHERE idempotency_key = ?",
                Long.class,
                idempotencyKey);
        return quantity == null ? -1L : quantity;
    }

    private int orderAccountId(String idempotencyKey) {
        Integer accountId = jdbcTemplate.queryForObject(
                "SELECT account_id FROM orders WHERE idempotency_key = ?",
                Integer.class,
                idempotencyKey);
        return accountId == null ? -1 : accountId;
    }

    private int orderInstrumentId(String idempotencyKey) {
        Integer instrumentId = jdbcTemplate.queryForObject(
                "SELECT instrument_id FROM orders WHERE idempotency_key = ?",
                Integer.class,
                idempotencyKey);
        return instrumentId == null ? -1 : instrumentId;
    }
}

