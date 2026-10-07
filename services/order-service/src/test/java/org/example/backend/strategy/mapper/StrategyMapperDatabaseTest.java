package org.example.backend.strategy.mapper;

import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.example.backend.enums.OrderSide;
import org.example.backend.strategy.model.NewStrategy;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyRun;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.model.TriggerDirection;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Runs {@code StrategyMapper.xml} and {@code strategy-schema.sql} against a real PostgreSQL, in a schema of its own that it drops at
 * the end. It needs no Docker: point it at any scratch database.
 *
 * <pre>
 * STRATEGY_TEST_JDBC_URL=jdbc:postgresql://localhost:5432/scratch
 * STRATEGY_TEST_JDBC_USER=postgres
 * STRATEGY_TEST_JDBC_PASSWORD=...
 * </pre>
 *
 * Without {@code STRATEGY_TEST_JDBC_URL} every test here is skipped, so the normal build does not need a database.
 *
 * <p>What a unit test cannot show, and this does: the SQL is valid, the result maps onto the records, the lifecycle trigger
 * holds, and, the point of the feature, a switch-off and an order being placed cannot both win.
 */
class StrategyMapperDatabaseTest {

    private static final String SCHEMA = "strategy_mapper_it";

    private static String url;
    private static String user;
    private static String password;
    private static SqlSessionFactory sessions;

    @BeforeAll
    static void connect() throws Exception {
        url = System.getenv("STRATEGY_TEST_JDBC_URL");
        assumeTrue(url != null && !url.isBlank(), "STRATEGY_TEST_JDBC_URL is not set");
        user = System.getenv().getOrDefault("STRATEGY_TEST_JDBC_USER", "postgres");
        password = System.getenv().getOrDefault("STRATEGY_TEST_JDBC_PASSWORD", "");

        try (Connection connection = DriverManager.getConnection(url, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
            statement.execute("CREATE SCHEMA " + SCHEMA);
        }
        try (Connection connection = schemaConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("schema.sql"));
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("strategy-schema.sql"));
        }

        UnpooledDataSource dataSource = new UnpooledDataSource("org.postgresql.Driver", schemaUrl(), user, password);
        dataSource.setAutoCommit(true);
        Configuration configuration = new Configuration(new Environment("it", new JdbcTransactionFactory(), dataSource));
        try (InputStream xml = StrategyMapperDatabaseTest.class.getClassLoader().getResourceAsStream("mapper/StrategyMapper.xml")) {
            assertNotNull(xml);
            new org.apache.ibatis.builder.xml.XMLMapperBuilder(
                    xml, configuration, "mapper/StrategyMapper.xml", configuration.getSqlFragments()).parse();
        }
        sessions = new SqlSessionFactoryBuilder().build(configuration);
    }

    @AfterAll
    static void dropSchema() throws Exception {
        if (url == null || url.isBlank()) {
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

    @BeforeEach
    void freshRows() throws SQLException {
        sql("TRUNCATE strategy_run, strategy, orders, holdings, account, instrument RESTART IDENTITY CASCADE");
        sql("INSERT INTO instrument (instrument_id, instrument_ticker, instrument_name, asset_class, currency) "
                + "VALUES (2001, 'AAPL', 'Apple Inc.', 'EQUITY', 'USD')");
        sql("INSERT INTO account (account_id, account_number, user_id, opening_date, currency, balance, purchasing_power) "
                + "VALUES (1001, 'ACC000001001', 7, CURRENT_DATE, 'USD', 10000, 10000)");
    }

    private static NewStrategy newStrategy(boolean armed, OffsetDateTime until) {
        return new NewStrategy(1001, 2001, OrderSide.BUY, 50, TriggerDirection.BELOW, new BigDecimal("150.0000"), armed,
                null, until, new BigDecimal("10000.00"), 200, 1, 3);
    }

    private long create() {
        try (SqlSession session = sessions.openSession(true)) {
            return session.getMapper(StrategyMapper.class).insertIfUnderLimit(newStrategy(true, null), 20).orElseThrow();
        }
    }

    private Strategy read(long id) {
        try (SqlSession session = sessions.openSession(true)) {
            return session.getMapper(StrategyMapper.class).selectById(id).orElseThrow();
        }
    }

    /** How many rows a mapper statement changed. */
    private int rows(java.util.function.ToIntFunction<StrategyMapper> use) {
        try (SqlSession session = sessions.openSession(true)) {
            return use.applyAsInt(session.getMapper(StrategyMapper.class));
        }
    }

    private <T> T mapper(java.util.function.Function<StrategyMapper, T> use) {
        try (SqlSession session = sessions.openSession(true)) {
            return use.apply(session.getMapper(StrategyMapper.class));
        }
    }

    @Test
    void aCreatedStrategyIsReadBackWithEveryFieldMappedAndItsInstrumentJoined() {
        long id = create();

        Strategy strategy = read(id);

        assertEquals(id, strategy.strategyId());
        assertEquals(1001, strategy.accountId());
        assertEquals(2001, strategy.instrumentId());
        assertEquals("AAPL", strategy.tickerSymbol());
        assertEquals("Apple Inc.", strategy.instrumentName());
        assertEquals("USD", strategy.currency());
        assertEquals(OrderSide.BUY, strategy.side());
        assertEquals(50, strategy.quantity());
        assertEquals(TriggerDirection.BELOW, strategy.direction());
        assertEquals(0, new BigDecimal("150").compareTo(strategy.triggerPrice()));
        assertTrue(strategy.armed());
        assertNull(strategy.validFrom());
        assertNull(strategy.validUntil());
        assertEquals(0, new BigDecimal("10000").compareTo(strategy.maxOrderValue()));
        assertEquals(200, strategy.maxPositionQty());
        assertEquals(1, strategy.maxExecutions());
        assertEquals(3, strategy.maxFailures());
        assertEquals(0, strategy.executions());
        assertEquals(0, strategy.consecutiveFailures());
        assertEquals(StrategyStatus.ACTIVE, strategy.status());
        assertNull(strategy.statusReason());
        assertNull(strategy.lastOrderId());
        assertEquals(1, strategy.version());
        assertNotNull(strategy.createdAt());
        assertNull(strategy.executedAt());
        assertEquals("strat-" + id + "-1", strategy.nextOrderKey());
    }

    @Test
    void aWindowEndRoundTrips() {
        OffsetDateTime until = OffsetDateTime.now().plusDays(10).withNano(0);
        long id = mapper(m -> m.insertIfUnderLimit(newStrategy(false, until), 20)).orElseThrow();

        Strategy strategy = read(id);

        assertEquals(until.toInstant(), strategy.validUntil().toInstant());
        assertFalse(strategy.armed(), "created un-armed when the caller did not see a price on the safe side");
    }

    @Test
    void theCapCountsOpenStrategiesOnlyAndIsRespectedByTheInsertItself() {
        long first = create();
        long second = create();

        assertTrue(mapper(m -> m.insertIfUnderLimit(newStrategy(true, null), 2)).isEmpty(), "two open, cap of two");
        assertTrue(mapper(m -> m.insertIfUnderLimit(newStrategy(true, null), 3)).isPresent());

        // A cancelled one no longer counts.
        mapper(m -> m.cancel(first, "Cancelled by the customer"));
        mapper(m -> m.cancel(second, "Cancelled by the customer"));
        assertTrue(mapper(m -> m.insertIfUnderLimit(newStrategy(true, null), 2)).isPresent());
    }

    @Test
    void theAccountsStrategiesAreListedNewestFirst() {
        long first = create();
        long second = create();

        List<Strategy> list = mapper(m -> m.selectByAccountId(1001));

        assertEquals(List.of(second, first), list.stream().map(Strategy::strategyId).toList());
        assertTrue(mapper(m -> m.selectByAccountId(9999)).isEmpty());
    }

    @Test
    void switchingOffWorksWhileWatchingOrRunningAndNotOnceFinished() throws SQLException {
        long watching = create();
        assertEquals(1, rows(m -> m.disable(watching, "Switched off by the customer")));
        assertEquals(StrategyStatus.DISABLED, read(watching).status());
        assertEquals("Switched off by the customer", read(watching).statusReason());
        assertEquals(0, rows(m -> m.disable(watching, "again")), "already off");

        long running = create();
        sql("UPDATE strategy SET status = 'EXECUTING', claimed_at = now() WHERE strategy_id = " + running);
        assertEquals(1, rows(m -> m.disable(running, "Switched off by the customer")), "a claimed strategy can still be switched off");

        long done = create();
        sql("UPDATE strategy SET status = 'EXECUTED' WHERE strategy_id = " + done);
        assertEquals(0, rows(m -> m.disable(done, "x")));
    }

    @Test
    void switchingBackOnReArmsItAndClearsTheFailures() throws SQLException {
        long id = create();
        sql("UPDATE strategy SET consecutive_failures = 2, status = 'DISABLED', status_reason = 'x' WHERE strategy_id = " + id);

        assertEquals(1, rows(m -> m.enable(id)));

        Strategy strategy = read(id);
        assertEquals(StrategyStatus.ACTIVE, strategy.status());
        assertFalse(strategy.armed(), "it needs a fresh crossing");
        assertEquals(0, strategy.consecutiveFailures());
        assertNull(strategy.statusReason());
        assertEquals(0, rows(m -> m.enable(id)), "only a switched-off strategy can be switched on");
    }

    @Test
    void aSwitchedOffStrategyWhoseWindowClosedCannotBeSwitchedOn() throws SQLException {
        long id = create();
        sql("UPDATE strategy SET status = 'DISABLED', valid_until = now() - interval '1 minute' WHERE strategy_id = " + id);

        assertEquals(0, rows(m -> m.enable(id)));
        assertEquals(StrategyStatus.DISABLED, read(id).status());
    }

    @Test
    void cancellingIsFinalAndStampsTheTime() {
        long id = create();

        assertEquals(1, rows(m -> m.cancel(id, "Cancelled by the customer")));

        Strategy strategy = read(id);
        assertEquals(StrategyStatus.CANCELLED, strategy.status());
        assertNotNull(strategy.cancelledAt(), "the lifecycle trigger stamps it");
        assertEquals(0, rows(m -> m.cancel(id, "again")));
        assertEquals(0, rows(m -> m.enable(id)));
        assertEquals(0, rows(m -> m.disable(id, "x")));
    }

    @Test
    void theDatabaseRefusesToLeaveAFinalStatusEvenForAStatementThatTriesTo() throws SQLException {
        long id = create();
        mapper(m -> m.cancel(id, "Cancelled by the customer"));

        SQLException ex = assertThrows(SQLException.class, () -> sql("UPDATE strategy SET status = 'ACTIVE' WHERE strategy_id = " + id));

        assertTrue(ex.getMessage().contains("CANCELLED strategy cannot change status"), ex.getMessage());
        assertEquals(StrategyStatus.CANCELLED, read(id).status());
    }

    @Test
    void onlyAnActiveStrategyCanBeClaimed() throws SQLException {
        long id = create();
        mapper(m -> m.disable(id, "x"));

        SQLException ex = assertThrows(SQLException.class, () -> sql("UPDATE strategy SET status = 'EXECUTING' WHERE strategy_id = " + id));

        assertTrue(ex.getMessage().contains("Only an ACTIVE strategy can be claimed"), ex.getMessage());
    }

    @Test
    void theTrailIsReadNewestFirstWithItsOutcomeAndOrder() throws SQLException {
        long id = create();
        sql("INSERT INTO strategy_run (strategy_id, run_number, quote_price, outcome, detail) VALUES (" + id + ", 1, 151.2, 'BLOCKED_LIMIT', 'over the limit')");
        sql("INSERT INTO strategy_run (strategy_id, run_number, quote_price, outcome, order_id, detail) VALUES (" + id + ", 1, 149.8, 'ORDERED', NULL, 'Order placed')");

        List<StrategyRun> runs = mapper(m -> m.selectRuns(id, 50));

        assertEquals(2, runs.size());
        assertEquals("ORDERED", runs.get(0).outcome().name());
        assertEquals(0, new BigDecimal("149.8").compareTo(runs.get(0).quotePrice()));
        assertEquals("BLOCKED_LIMIT", runs.get(1).outcome().name());
        assertNull(runs.get(0).settledStatus());
        assertEquals(1, mapper(m -> m.selectRuns(id, 1)).size());
    }

    @Test
    void anOrdersEndIsRecordedOnItsRunOnceAndOnlyForAnOrderedRun() throws SQLException {
        long id = create();
        sql("INSERT INTO strategy_run (strategy_id, run_number, outcome) VALUES (" + id + ", 1, 'API_ERROR')");
        assertEquals(0, rows(m -> m.settleRun(id, 1, "FILLED")), "a run that placed no order has nothing to settle");

        sql("INSERT INTO strategy_run (strategy_id, run_number, outcome) VALUES (" + id + ", 1, 'ORDERED')");
        assertEquals(1, rows(m -> m.settleRun(id, 1, "FILLED")));
        assertEquals(0, rows(m -> m.settleRun(id, 1, "REJECTED")), "already settled: left alone");

        assertEquals("FILLED", mapper(m -> m.selectRuns(id, 50)).stream()
                .filter(run -> run.outcome().name().equals("ORDERED")).findFirst().orElseThrow().settledStatus());
    }

    @Test
    void stoppedAndExpiredStrategiesAreAnnouncedOnceAndNotAgain() throws SQLException {
        long failed = create();
        long expired = create();
        long fine = create();
        sql("UPDATE strategy SET status = 'FAILED' WHERE strategy_id = " + failed);
        sql("UPDATE strategy SET status = 'EXPIRED' WHERE strategy_id = " + expired);

        List<Strategy> pending = mapper(m -> m.selectNeedingAnnouncement(10));
        assertEquals(List.of(failed, expired), pending.stream().map(Strategy::strategyId).toList());
        assertFalse(pending.stream().anyMatch(s -> s.strategyId() == fine));

        assertEquals(1, rows(m -> m.markAnnounced(failed)));
        assertEquals(List.of(expired), mapper(m -> m.selectNeedingAnnouncement(10)).stream().map(Strategy::strategyId).toList());
        assertEquals(0, rows(m -> m.markAnnounced(fine)), "an open strategy is never marked announced");
    }

    // ---------------------------------------------------------------- the point of the feature

    /**
     * The order route reads the strategy with a shared lock, in the transaction that places the order. A switch-off needs the
     * exclusive lock, so it cannot land between that read and the order being written: it waits for the order's transaction.
     */
    @Test
    void aSwitchOffWaitsForAnOrderBeingPlacedAndThenTakesEffect() throws Exception {
        long id = create();
        sql("UPDATE strategy SET status = 'EXECUTING', claimed_at = now() WHERE strategy_id = " + id);

        SqlSession orderTransaction = sessions.openSession(false);
        try {
            Optional<Strategy> seen = orderTransaction.getMapper(StrategyMapper.class).selectByIdForShare(id);
            assertEquals(StrategyStatus.EXECUTING, seen.orElseThrow().status(), "the order route sees it claimed");

            CompletableFuture<Integer> switchOff = CompletableFuture.supplyAsync(() -> mapper(m -> m.disable(id, "Switched off by the customer")));
            Thread.sleep(700);
            assertFalse(switchOff.isDone(), "the switch-off must wait while the order's transaction holds the strategy");

            orderTransaction.commit(true); // a session that only read must be told to commit, or the lock is never released

            assertEquals(1, switchOff.get(10, TimeUnit.SECONDS));
        } finally {
            orderTransaction.close();
        }
        assertEquals(StrategyStatus.DISABLED, read(id).status());
    }

    @Test
    void anOrderThatLooksAfterTheSwitchOffSeesItAndIsRefused() throws Exception {
        long id = create();
        sql("UPDATE strategy SET status = 'EXECUTING', claimed_at = now() WHERE strategy_id = " + id);
        assertEquals(1, rows(m -> m.disable(id, "Switched off by the customer")));

        try (SqlSession orderTransaction = sessions.openSession(false)) {
            Strategy seen = orderTransaction.getMapper(StrategyMapper.class).selectByIdForShare(id).orElseThrow();

            assertEquals(StrategyStatus.DISABLED, seen.status());
            orderTransaction.rollback();
        }
    }

    @Test
    void aSwitchOffThatArrivesWhileTheOrderRouteIsWaitingOnItIsSeenWhenTheLockIsGranted() throws Exception {
        long id = create();
        sql("UPDATE strategy SET status = 'EXECUTING', claimed_at = now() WHERE strategy_id = " + id);

        SqlSession customer = sessions.openSession(false);
        try {
            assertEquals(1, (int) customer.getMapper(StrategyMapper.class).disable(id, "Switched off by the customer"));
            CompletableFuture<StrategyStatus> orderRoute = CompletableFuture.supplyAsync(() -> {
                try (SqlSession order = sessions.openSession(false)) {
                    StrategyStatus status = order.getMapper(StrategyMapper.class).selectByIdForShare(id).orElseThrow().status();
                    order.rollback();
                    return status;
                }
            });
            Thread.sleep(700);
            assertFalse(orderRoute.isDone(), "the order route waits for the customer's uncommitted switch-off");

            customer.commit();

            assertEquals(StrategyStatus.DISABLED, orderRoute.get(10, TimeUnit.SECONDS), "and then finds it switched off");
        } finally {
            customer.close();
        }
    }
}
