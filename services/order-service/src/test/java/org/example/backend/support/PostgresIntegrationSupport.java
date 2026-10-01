package org.example.backend.support;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
public abstract class PostgresIntegrationSupport {

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("trade_test")
                    .withUsername("postgres")
                    .withPassword("postgres");

    static {
        // Start once for the full test JVM to keep JDBC URL stable across cached Spring contexts.
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void registerDatasourceProperties(
            DynamicPropertyRegistry registry) {

        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", POSTGRES::getDriverClassName);
        registry.add("jwt.secret", () -> "test-secret-key-that-is-long-enough-for-hs256-algorithm-testing");
        registry.add("mybatis.mapper-locations", () -> "classpath:mapper/*.xml");
        registry.add("mybatis.type-aliases-package", () -> "org.example.backend.entities");
    }

    protected void resetSchema(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS client (
                    client_id INTEGER PRIMARY KEY,
                    client_name VARCHAR(255) NOT NULL
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS instrument (
                    instrument_id SERIAL PRIMARY KEY,
                    instrument_ticker VARCHAR(20) NOT NULL UNIQUE,
                    instrument_name VARCHAR(255) NOT NULL,
                    asset_class VARCHAR(20) NOT NULL,
                    instrument_status VARCHAR(20) NOT NULL
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS account (
                    account_id SERIAL PRIMARY KEY,
                    account_number VARCHAR(32) NOT NULL UNIQUE,
                    opening_date DATE NOT NULL,
                    balance NUMERIC(19,2) NOT NULL,
                    purchasing_power NUMERIC(19,2) NOT NULL,
                    account_status VARCHAR(20) NOT NULL,
                    currency VARCHAR(3) NOT NULL,
                    version BIGINT NOT NULL,
                    suspended_at TIMESTAMPTZ NULL,
                    closed_at TIMESTAMPTZ NULL,
                    client_id INTEGER NOT NULL REFERENCES client(client_id)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    holding_id SERIAL PRIMARY KEY,
                    quantity BIGINT NOT NULL,
                    purchase_price NUMERIC(19,2) NOT NULL,
                    account_id INTEGER NOT NULL REFERENCES account(account_id),
                    instrument_id INTEGER NOT NULL REFERENCES instrument(instrument_id),
                    CONSTRAINT uk_holdings_account_instrument UNIQUE (account_id, instrument_id)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    order_id SERIAL PRIMARY KEY,
                    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
                    order_status VARCHAR(20) NOT NULL,
                    received_at TIMESTAMPTZ NOT NULL,
                    order_type VARCHAR(10) NOT NULL,
                    order_pricing_type VARCHAR(20) NOT NULL,
                    price NUMERIC(19,4) NOT NULL,
                    quantity BIGINT NOT NULL,
                    transaction_date TIMESTAMPTZ NULL,
                    account_id INTEGER NOT NULL REFERENCES account(account_id),
                    instrument_id INTEGER NOT NULL REFERENCES instrument(instrument_id)
                )
                """);

        jdbcTemplate.execute("TRUNCATE TABLE orders, holdings, account, instrument, client RESTART IDENTITY CASCADE");
    }
}
