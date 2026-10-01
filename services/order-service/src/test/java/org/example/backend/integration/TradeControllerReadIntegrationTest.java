package org.example.backend.integration;

import org.example.backend.security.ApiAuthenticationFilter;
import org.example.backend.support.PostgresIntegrationSupport;
import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
// @Disabled("Requires Docker-enabled Postgres test environment")
class TradeControllerReadIntegrationTest extends PostgresIntegrationSupport {

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private ApiAuthenticationFilter apiAuthenticationFilter;

    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .webAppContextSetup(webApplicationContext)
            .addFilters(apiAuthenticationFilter)
                .build();
        resetSchema(jdbcTemplate);
        seedReferenceData();
        seedOrdersAndPositions();
    }

    @Test
    void accountReturnedSuccessfully() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1")
                        .header("Authorization", "Bearer dev-account-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.accountId").value("ACC-000001"))
                .andExpect(jsonPath("$.holderName").value("Priya Menon"))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(7))
                .andExpect(jsonPath("$.lastUpdated").isNotEmpty());
    }

    @Test
    void balanceReturnedSuccessfully() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/balance")
                        .header("Authorization", "Bearer dev-account-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.asOf").isNotEmpty());
    }

    @Test
    void positionsReturnedSuccessfully() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/positions")
                        .header("Authorization", "Bearer dev-account-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("ACME"))
                .andExpect(jsonPath("$[0].quantity").value(100))
                .andExpect(jsonPath("$[0].averageCost").value(25.50))
                .andExpect(jsonPath("$[1].symbol").value("INFY.NS"))
                .andExpect(jsonPath("$[1].quantity").value(40));
    }

    @Test
    void orderHistoryReturnedSuccessfully() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/orders")
                        .header("Authorization", "Bearer dev-account-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId").value("2"))
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("INFY.NS"))
                .andExpect(jsonPath("$[0].side").value("SELL"))
                .andExpect(jsonPath("$[0].orderPricingType").value("LIMIT"))
                .andExpect(jsonPath("$[0].status").value("CANCELLED"))
                .andExpect(jsonPath("$[0].executedPrice").doesNotExist())
                .andExpect(jsonPath("$[1].orderId").value("1"))
                .andExpect(jsonPath("$[1].symbol").value("ACME"))
                .andExpect(jsonPath("$[1].side").value("BUY"))
                .andExpect(jsonPath("$[1].orderPricingType").value("LIMIT"))
                .andExpect(jsonPath("$[1].status").value("FILLED"))
                .andExpect(jsonPath("$[1].executedPrice").value(25.50));
    }

    @Test
    void unknownAccountReturnsAcc404() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/999")
                        .header("Authorization", "Bearer dev-account-999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"))
                .andExpect(jsonPath("$.message").value("Account not found"));
    }

    @Test
    void tokenThatDoesNotReachAccountReturnsAcc403() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1")
                        .header("Authorization", "Bearer dev-account-2"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"))
                .andExpect(jsonPath("$.message").value("Account not active"));
    }

    private void seedReferenceData() {
        jdbcTemplate.update(
                "INSERT INTO client (client_id, client_name) VALUES (1, 'Priya Menon'), (2, 'Rahul Sharma')");

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
                ) VALUES
                    (1, 'ACC-000001', DATE '2024-01-01', 24500.75, 24500.75, 'ACTIVE', 'USD', 7, NULL, NULL, 1),
                    (2, 'ACC-000002', DATE '2024-01-02', 18000.00, 18000.00, 'ACTIVE', 'USD', 3, NULL, NULL, 2)
                """);

        jdbcTemplate.update(
                """
                INSERT INTO instrument (
                    instrument_id,
                    instrument_ticker,
                    instrument_name,
                    asset_class,
                    instrument_status
                ) VALUES
                    (101, 'ACME', 'Acme Corp', 'EQUITY', 'TRADING'),
                    (102, 'INFY.NS', 'Infosys NSE', 'EQUITY', 'TRADING'),
                    (103, 'ZERO', 'Zero Position', 'EQUITY', 'TRADING')
                """);
    }

    private void seedOrdersAndPositions() {
        jdbcTemplate.update(
                """
                INSERT INTO holdings (
                    holding_id,
                    quantity,
                    purchase_price,
                    account_id,
                    instrument_id
                ) VALUES
                    (1, 100, 25.50, 1, 101),
                    (2, 40, 1580.25, 1, 102),
                    (3, 0, 99.99, 1, 103)
                """);

        jdbcTemplate.update(
                """
                INSERT INTO orders (
                    order_id,
                    idempotency_key,
                    order_status,
                    received_at,
                    order_type,
                    order_pricing_type,
                    price,
                    quantity,
                    transaction_date,
                    account_id,
                    instrument_id
                ) VALUES
                    (1, 'idem-filled', 'FILLED', '2026-09-10T09:14:22Z', 'BUY', 'LIMIT', 25.50, 100, '2026-09-10T09:14:25Z', 1, 101),
                    (2, 'idem-cancelled', 'CANCELLED', '2026-09-10T10:14:22Z', 'SELL', 'LIMIT', 1600.00, 40, '2026-09-10T10:15:00Z', 1, 102)
                """);
    }
}




