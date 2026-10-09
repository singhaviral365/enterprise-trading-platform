package org.example.trade_executor.strategy;

import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.exceptions.PersistenceException;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.example.backend.enums.OrderSide;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.NewRun;
import org.example.trade_executor.strategy.model.RunOutcome;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.TriggerDirection;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.ToIntFunction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Runs {@code ExecutorStrategyMapper.xml} against a real PostgreSQL, on the table the order-service creates
 * ({@code strategy-schema.sql}), in a schema of its own that it drops at the end. It needs no Docker:
 *
 * <pre>
 * STRATEGY_TEST_JDBC_URL=jdbc:postgresql://localhost:5432/scratch
 * STRATEGY_TEST_JDBC_USER=postgres
 * STRATEGY_TEST_JDBC_PASSWORD=...
 * </pre>
 *
 * Without {@code STRATEGY_TEST_JDBC_URL} every test here is skipped. The claim is one UPDATE, so what is shown here is what no
 * mock can: that of two workers claiming at once exactly one wins, and that a customer's switch-off is never overwritten.
 */
class StrategyMapperDatabaseTest {

    private static final String SCHEMA = "executor_strategy_it";
    private static final Path ORDER_SERVICE_RESOURCES = Path.of("..", "order-service", "src", "main", "resources");

    private static String url;
    private static String user;
    private static String password;
    private static SqlSessionFactory sessions;

    @BeforeAll
    static void connect() throws Exception {
        url = System.getenv("STRATEGY_TEST_JDBC_URL");
        assumeTrue(url != null && !url.isBlank(), "STRATEGY_TEST_JDBC_URL is not set");
        assumeTrue(Files.exists(ORDER_SERVICE_RESOURCES.resolve("strategy-schema.sql")),
                "the order-service's schema scripts are not reachable from this working directory");
        user = System.getenv().getOrDefault("STRATEGY_TEST_JDBC_USER", "postgres");
        password = System.getenv().getOrDefault("STRATEGY_TEST_JDBC_PASSWORD", "");

        try (Connection connection = DriverManager.getConnection(url, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
            statement.execute("CREATE SCHEMA " + SCHEMA);
        }
        try (Connection connection = schemaConnection()) {
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(ORDER_SERVICE_RESOURCES.resolve("schema.sql")));
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(ORDER_SERVICE_RESOURCES.resolve("strategy-schema.sql")));
        }

        UnpooledDataSource dataSource = new UnpooledDataSource("org.postgresql.Driver", schemaUrl(), user, password);
        dataSource.setAutoCommit(true);
        Configuration configuration = new Configuration(new Environment("it", new JdbcTransactionFactory(), dataSource));
        try (InputStream xml = StrategyMapperDatabaseTest.class.getClassLoader().getResourceAsStream("mapper/ExecutorStrategyMapper.xml")) {
            assertNotNull(xml);
            new org.apache.ibatis.builder.xml.XMLMapperBuilder(
                    xml, configuration, "mapper/ExecutorStrategyMapper.xml", configuration.getSqlFragments()).parse();
        }
        sessions = new SqlSessionFactoryBuilder().build(configuration);
    }

    @AfterAll
    static void dropSchema() throws Exception {
        if (url == null || url.isBlank() || sessions == null) {
            return;
        }
        try (Connection connection = DriverManager.getConnection(url, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
        }
    }

    private static String schemaUrl() {
        return url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA;
    }

    private static Connection schemaConnection() throws SQLException {
        return DriverManager.getConnection(schemaUrl(), user, password);
    }

    private static void sql(String statementText) throws SQLException {
        try (Connection connection = schemaConnection(); Statement statement = connection.createStatement()) {
            statement.execute(statementText);
        }
    }

    private static String scalar(String query) throws SQLException {
        try (Connection connection = schemaConnection(); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(query)) {
            return rows.next() ? rows.getString(1) : null;
        }
    }

    @BeforeEach
    void freshRows() throws SQLException {
        sql("TRUNCATE strategy_run, strategy, orders, holdings, account, instrument RESTART IDENTITY CASCADE");
        sql("INSERT INTO instrument (instrument_id, instrument_ticker, instrument_name, asset_class, currency) "
                + "VALUES (2001, 'AAPL', 'Apple Inc.', 'EQUITY', 'USD')");
        sql("INSERT INTO account (account_id, account_number, user_id, opening_date, currency, balance, purchasing_power) "
                + "VALUES (1001, 'ACC000001001', 1004, CURRENT_DATE, 'USD', 10000, 10000)");
    }

    /** An ACTIVE, armed, one-run strategy 5001 on AAPL: buy 50 below 150, up to 10,000 and 200 held. */
    private void active(String extra) throws SQLException {
        sql("INSERT INTO strategy (strategy_id, account_id, instrument_id, side, quantity, trigger_direction, trigger_price, armed, "
                + "max_order_value, max_position_qty" + (extra.isEmpty() ? "" : ", " + extra.split("\\|")[0]) + ") "
                + "OVERRIDING SYSTEM VALUE VALUES (5001, 1001, 2001, 'BUY', 50, 'BELOW', 150, TRUE, 10000, 200"
                + (extra.isEmpty() ? "" : ", " + extra.split("\\|")[1]) + ")");
    }

    private <T> T use(Function<StrategyMapper, T> action) {
        try (SqlSession session = sessions.openSession(true)) {
            return action.apply(session.getMapper(StrategyMapper.class));
        }
    }

    private int rows(ToIntFunction<StrategyMapper> action) {
        try (SqlSession session = sessions.openSession(true)) {
            return action.applyAsInt(session.getMapper(StrategyMapper.class));
        }
    }

    private static NewRun run(RunOutcome outcome, Long orderId) {
        return new NewRun(5001, 1, new BigDecimal("149.8"), OffsetDateTime.now(), outcome, orderId, "detail");
    }

    // ---------------------------------------------------------------- reading what is waiting

    @Test
    void anActiveStrategyIsReadWithItsOwnerItsInstrumentAndItsRunKey() throws SQLException {
        active("");

        RunnableStrategy strategy = use(m -> m.selectActiveForTicker("AAPL")).get(0);

        assertEquals(5001, strategy.strategyId());
        assertEquals(1001, strategy.accountId());
        assertEquals(1004, strategy.ownerUserId(), "the account's user: whom the order's token is minted for");
        assertEquals("AAPL", strategy.tickerSymbol());
        assertEquals("USD", strategy.instrumentCurrency());
        assertEquals(OrderSide.BUY, strategy.side());
        assertEquals(TriggerDirection.BELOW, strategy.direction());
        assertEquals(0, new BigDecimal("150").compareTo(strategy.triggerPrice()));
        assertTrue(strategy.armed());
        assertEquals(0, new BigDecimal("10000").compareTo(strategy.maxOrderValue()));
        assertEquals("strat-5001-1", strategy.orderKey());
    }

    @Test
    void onlyActiveStrategiesOnThatInstrumentAreRead() throws SQLException {
        active("");
        sql("UPDATE strategy SET status = 'DISABLED' WHERE strategy_id = 5001");

        assertTrue(use(m -> m.selectActiveForTicker("AAPL")).isEmpty());
        assertTrue(use(m -> m.selectActiveForTicker("MSFT")).isEmpty());
    }

    // ---------------------------------------------------------------- arming

    @Test
    void aStrategyIsArmedOnceAndOnlyWhileActive() throws SQLException {
        active("");
        sql("UPDATE strategy SET armed = FALSE WHERE strategy_id = 5001");

        assertEquals(1, rows(m -> m.arm(5001)));
        assertEquals("t", scalar("SELECT armed FROM strategy WHERE strategy_id = 5001"));
        assertEquals(0, rows(m -> m.arm(5001)), "already armed");

        sql("UPDATE strategy SET armed = FALSE, status = 'DISABLED' WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.arm(5001)), "a switched-off strategy is not touched");
    }

    // ---------------------------------------------------------------- the claim

    @Test
    void anActiveArmedStrategyIsClaimedOnceAndNotAgain() throws SQLException {
        active("");

        assertEquals(1, rows(m -> m.claim(5001)));
        assertEquals("EXECUTING", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertNotNull(scalar("SELECT claimed_at FROM strategy WHERE strategy_id = 5001"));
        assertEquals(0, rows(m -> m.claim(5001)), "a claimed strategy cannot be claimed again");
    }

    @Test
    void ofManyWorkersClaimingAtOnceExactlyOneWins() throws Exception {
        active("");
        int workers = 12;
        ExecutorService pool = Executors.newFixedThreadPool(workers);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            results.add(pool.submit(() -> {
                go.await();
                return rows(m -> m.claim(5001));
            }));
        }
        go.countDown();
        int wins = 0;
        for (Future<Integer> result : results) {
            wins += result.get(30, TimeUnit.SECONDS);
        }
        pool.shutdownNow();

        assertEquals(1, wins, "two workers must never both be told they hold the claim");
    }

    @Test
    void aStrategyThatIsNotArmedSwitchedOffExpiredOrOutOfRunsIsNotClaimed() throws SQLException {
        active("");

        sql("UPDATE strategy SET armed = FALSE WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.claim(5001)), "un-armed");
        sql("UPDATE strategy SET armed = TRUE, status = 'DISABLED' WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.claim(5001)), "switched off");
        sql("UPDATE strategy SET status = 'ACTIVE', valid_until = now() - interval '1 second' WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.claim(5001)), "window closed");
        sql("UPDATE strategy SET valid_until = NULL, valid_from = now() + interval '1 hour' WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.claim(5001)), "window not yet open");
        sql("UPDATE strategy SET valid_from = NULL, executions = 1 WHERE strategy_id = 5001");
        assertEquals(0, rows(m -> m.claim(5001)), "all runs used");
        sql("UPDATE strategy SET executions = 0 WHERE strategy_id = 5001");
        assertEquals(1, rows(m -> m.claim(5001)), "and once none of that is so, it is claimed");
    }

    @Test
    void theLastLookConfirmsAClaimOnlyWhileItIsStillHeld() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        assertEquals(1, rows(m -> m.confirmClaim(5001)));

        sql("UPDATE strategy SET status = 'DISABLED' WHERE strategy_id = 5001");

        assertEquals(0, rows(m -> m.confirmClaim(5001)), "a switch-off after the claim is seen before the order is sent");
    }

    @Test
    void aWindowThatClosedDuringTheRunIsSeenAtTheLastLook() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        sql("UPDATE strategy SET valid_until = now() - interval '1 second' WHERE strategy_id = 5001");

        assertEquals(0, rows(m -> m.confirmClaim(5001)));
    }

    // ---------------------------------------------------------------- what comes of a run

    @Test
    void aFailureGivesTheClaimBackAndCountsUntilTheLimitStopsTheStrategy() throws SQLException {
        active("max_failures|2");
        rows(m -> m.claim(5001));

        assertEquals(Optional.of("ACTIVE"), use(m -> m.recordFailure(5001, "over the limit")));
        assertEquals("1", scalar("SELECT consecutive_failures FROM strategy WHERE strategy_id = 5001"));
        assertEquals("over the limit", scalar("SELECT status_reason FROM strategy WHERE strategy_id = 5001"));
        assertEquals("t", scalar("SELECT claimed_at IS NULL FROM strategy WHERE strategy_id = 5001"));

        rows(m -> m.claim(5001));
        assertEquals(Optional.of("FAILED"), use(m -> m.recordFailure(5001, "down")));
        assertTrue(scalar("SELECT status_reason FROM strategy WHERE strategy_id = 5001").startsWith("Stopped after 2 failed attempts in a row. Last problem: down"));
        assertEquals(0, rows(m -> m.claim(5001)), "a stopped strategy is never claimed again");
    }

    @Test
    void aFailureNeverOverwritesACustomersSwitchOff() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        sql("UPDATE strategy SET status = 'DISABLED', status_reason = 'Switched off by the customer' WHERE strategy_id = 5001");

        assertEquals(Optional.empty(), use(m -> m.recordFailure(5001, "down")));

        assertEquals("DISABLED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("0", scalar("SELECT consecutive_failures FROM strategy WHERE strategy_id = 5001"));
        assertEquals("Switched off by the customer", scalar("SELECT status_reason FROM strategy WHERE strategy_id = 5001"));
    }

    @Test
    void aLongReasonIsCutToWhatTheColumnHolds() throws SQLException {
        active("");
        rows(m -> m.claim(5001));

        use(m -> m.recordFailure(5001, "x".repeat(500)));

        assertEquals("200", scalar("SELECT length(status_reason) FROM strategy WHERE strategy_id = 5001"));
    }

    @Test
    void aPlacedOrderIsCountedAndAOneRunStrategyIsDone() throws SQLException {
        active("");
        rows(m -> m.claim(5001));

        assertEquals(1, rows(m -> m.recordSuccess(5001, 77)));

        assertEquals("EXECUTED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("1", scalar("SELECT executions FROM strategy WHERE strategy_id = 5001"));
        assertEquals("77", scalar("SELECT last_order_id FROM strategy WHERE strategy_id = 5001"));
        assertNotNull(scalar("SELECT executed_at FROM strategy WHERE strategy_id = 5001"));
        assertEquals("t", scalar("SELECT status_reason IS NULL FROM strategy WHERE strategy_id = 5001"));
    }

    @Test
    void aStrategyWithRunsLeftGoesBackToWatchingAndNeedsAFreshCrossing() throws SQLException {
        active("max_executions|3");
        rows(m -> m.claim(5001));

        rows(m -> m.recordSuccess(5001, 77));

        assertEquals("ACTIVE", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("f", scalar("SELECT armed FROM strategy WHERE strategy_id = 5001"));
        assertEquals("1", scalar("SELECT executions FROM strategy WHERE strategy_id = 5001"));
        assertEquals("strat-5001-2", use(m -> m.selectActiveForTicker("AAPL")).get(0).orderKey());
        assertEquals(0, rows(m -> m.claim(5001)), "it will not fire again until the price has crossed back");
    }

    @Test
    void anOrderPlacedJustAsTheCustomerSwitchedOffIsCountedButTheSwitchOffStands() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        sql("UPDATE strategy SET status = 'DISABLED' WHERE strategy_id = 5001");

        rows(m -> m.recordSuccess(5001, 77));

        assertEquals("DISABLED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("1", scalar("SELECT executions FROM strategy WHERE strategy_id = 5001"), "the order exists, so it is counted");
    }

    @Test
    void anOrderPlacedJustAsTheCustomerCancelledIsCountedButTheCancellationStands() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        sql("UPDATE strategy SET status = 'CANCELLED' WHERE strategy_id = 5001");

        rows(m -> m.recordSuccess(5001, 77));

        assertEquals("CANCELLED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("1", scalar("SELECT executions FROM strategy WHERE strategy_id = 5001"));
    }

    // ---------------------------------------------------------------- the trail

    @Test
    void aRunIsWrittenDownAndAnOrderCanBeWrittenDownOncePerRun() throws SQLException {
        active("");

        rows(m -> m.insertRun(run(RunOutcome.ORDERED, 77L)));

        assertEquals("ORDERED", scalar("SELECT outcome FROM strategy_run WHERE strategy_id = 5001"));
        assertEquals("77", scalar("SELECT order_id FROM strategy_run WHERE strategy_id = 5001"));
        // Inside the application, mybatis-spring turns this into a DuplicateKeyException, which the recorder expects.
        PersistenceException duplicate = assertThrows(PersistenceException.class, () -> rows(m -> m.insertRun(run(RunOutcome.DUPLICATE, 77L))));
        assertTrue(duplicate.getMessage().contains("uq_strategy_run_order"), duplicate.getMessage());
        rows(m -> m.insertRun(run(RunOutcome.API_ERROR, null)));
        rows(m -> m.insertRun(run(RunOutcome.API_ERROR, null)));
        assertEquals("3", scalar("SELECT count(*) FROM strategy_run"));
    }

    @Test
    void aLongDetailIsCutAndAMissingOrderIsNull() throws SQLException {
        active("");

        rows(m -> m.insertRun(new NewRun(5001, 1, new BigDecimal("1"), OffsetDateTime.now(), RunOutcome.REJECTED, null, "y".repeat(600))));

        assertEquals("200", scalar("SELECT length(detail) FROM strategy_run"));
        assertEquals("t", scalar("SELECT order_id IS NULL FROM strategy_run"));
    }

    @Test
    void aStaleQuoteIsRecordedOnlyOncePerFiveMinutes() throws SQLException {
        active("");

        assertEquals(1, rows(m -> m.insertStaleRunOnce(run(RunOutcome.STALE, null))));
        assertEquals(0, rows(m -> m.insertStaleRunOnce(run(RunOutcome.STALE, null))));
        sql("UPDATE strategy_run SET created_at = now() - interval '6 minutes'");
        assertEquals(1, rows(m -> m.insertStaleRunOnce(run(RunOutcome.STALE, null))));
    }

    @Test
    void anOrdersEndIsRecordedOnItsRun() throws SQLException {
        active("");
        rows(m -> m.insertRun(run(RunOutcome.ORDERED, 77L)));

        assertEquals(1, rows(m -> m.settleRun(5001, 1, "FILLED")));
        assertEquals(0, rows(m -> m.settleRun(5001, 1, "REJECTED")));
        assertEquals("FILLED", scalar("SELECT settled_status FROM strategy_run"));
    }

    @Test
    void anExistingOrderIsFoundByItsKeyAndItsStatusRead() throws SQLException {
        sql("INSERT INTO orders (idempotency_key, order_status, order_type, order_pricing_type, price, quantity, account_id, instrument_id) "
                + "VALUES ('strat-5001-1', 'NEW', 'BUY', 'MARKET', 1, 50, 1001, 2001)");

        Optional<ExistingOrder> order = use(m -> m.selectOrderByKey("strat-5001-1"));

        assertTrue(order.isPresent());
        assertEquals("NEW", order.get().status());
        assertFalse(order.get().isSettled());
        assertTrue(use(m -> m.selectOrderByKey("strat-5001-9")).isEmpty());
    }

    // ---------------------------------------------------------------- housekeeping

    @Test
    void anOverdueStrategyExpiresWhetherWatchingOrSwitchedOffAndAFinishedOneIsLeftAlone() throws SQLException {
        active("");
        sql("UPDATE strategy SET valid_until = now() + interval '1 hour' WHERE strategy_id = 5001");
        assertEquals(0, rows(StrategyMapper::expireOverdue), "not yet");

        sql("UPDATE strategy SET valid_until = now() - interval '1 second' WHERE strategy_id = 5001");
        assertEquals(1, rows(StrategyMapper::expireOverdue));
        assertEquals("EXPIRED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals(0, rows(StrategyMapper::expireOverdue), "already expired");
    }

    @Test
    void aClaimThatWasNeverFinishedIsGivenBackOnlyAfterItsTimeout() throws SQLException {
        active("");
        rows(m -> m.claim(5001));
        assertEquals(0, rows(m -> m.recoverStuck(120)), "a claim just taken is not stuck");

        sql("UPDATE strategy SET claimed_at = now() - interval '5 minutes' WHERE strategy_id = 5001");
        assertEquals(1, rows(m -> m.recoverStuck(120)));
        assertEquals("ACTIVE", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
        assertEquals("Recovered after an interrupted run", scalar("SELECT status_reason FROM strategy WHERE strategy_id = 5001"));
        assertEquals(1, rows(m -> m.claim(5001)), "and it can run again");
    }

    // ---------------------------------------------------------------- both services on one row

    /**
     * The scenario the live demonstration shows: the worker has claimed a strategy and is about to send its order, the
     * customer switches it off. Whatever the order of events, the last look refuses to send, and no order is placed.
     */
    @Test
    void aSwitchOffDuringTheRunIsSeenAtTheLastLookAndNothingIsSent() throws Exception {
        active("");
        assertEquals(1, rows(m -> m.claim(5001)));

        CompletableFuture<Integer> customer = CompletableFuture.supplyAsync(() -> {
            try (Connection connection = schemaConnection(); Statement statement = connection.createStatement()) {
                // exactly the order-service's disable statement
                return statement.executeUpdate("UPDATE strategy SET status = 'DISABLED', status_reason = 'Switched off by the customer', "
                        + "version = version + 1 WHERE strategy_id = 5001 AND status IN ('ACTIVE', 'EXECUTING')");
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
        });
        assertEquals(1, customer.get(10, TimeUnit.SECONDS));

        assertEquals(0, rows(m -> m.confirmClaim(5001)), "the worker must not send the order");
        assertEquals(Optional.empty(), use(m -> m.recordFailure(5001, "x")), "and nothing it records overwrites the switch-off");
        assertEquals("DISABLED", scalar("SELECT status FROM strategy WHERE strategy_id = 5001"));
    }
}
