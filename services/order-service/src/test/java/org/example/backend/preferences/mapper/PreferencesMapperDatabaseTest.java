package org.example.backend.preferences.mapper;

import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.DateFormatOption;
import org.example.backend.preferences.model.LandingPage;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.model.NumberFormatOption;
import org.example.backend.preferences.model.OrderTypeOption;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.preferences.model.ThemeOption;
import org.example.backend.preferences.model.TimeFormatOption;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.EnumSet;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Runs {@code PreferencesMapper.xml} and {@code preferences-schema.sql} against a real PostgreSQL. It needs no
 * Docker: point it at any scratch database and it works in a schema of its own, which it drops at the end.
 *
 * <pre>
 * PREFERENCES_TEST_JDBC_URL=jdbc:postgresql://localhost:5432/scratch
 * PREFERENCES_TEST_JDBC_USER=postgres
 * PREFERENCES_TEST_JDBC_PASSWORD=...
 * </pre>
 *
 * Without {@code PREFERENCES_TEST_JDBC_URL} every test here is skipped, so the normal build does not need a database.
 */
class PreferencesMapperDatabaseTest {

    private static final String SCHEMA = "pref_mapper_it";

    private static String url;
    private static String user;
    private static String password;
    private static SqlSessionFactory sessions;

    @BeforeAll
    static void connect() throws Exception {
        url = System.getenv("PREFERENCES_TEST_JDBC_URL");
        assumeTrue(url != null && !url.isBlank(), "PREFERENCES_TEST_JDBC_URL is not set");
        user = System.getenv().getOrDefault("PREFERENCES_TEST_JDBC_USER", "postgres");
        password = System.getenv().getOrDefault("PREFERENCES_TEST_JDBC_PASSWORD", "");

        try (Connection connection = DriverManager.getConnection(url, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
            statement.execute("CREATE SCHEMA " + SCHEMA);
        }

        UnpooledDataSource dataSource = new UnpooledDataSource(
                "org.postgresql.Driver", url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
        Configuration configuration = new Configuration(new Environment("it", new JdbcTransactionFactory(), dataSource));
        try (InputStream xml = PreferencesMapperDatabaseTest.class.getClassLoader()
                .getResourceAsStream("mapper/PreferencesMapper.xml")) {
            assertNotNull(xml);
            new org.apache.ibatis.builder.xml.XMLMapperBuilder(
                    xml, configuration, "mapper/PreferencesMapper.xml", configuration.getSqlFragments()).parse();
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

    @BeforeEach
    void freshTables() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP TABLE IF EXISTS customer_preference");
            statement.execute("DROP TABLE IF EXISTS orders");
            statement.execute("DROP TABLE IF EXISTS holdings");
            statement.execute("DROP TABLE IF EXISTS account");
            // Only the columns the module reads or converts, with the real types and the price checks.
            statement.execute("""
                    CREATE TABLE account (
                        account_id INTEGER PRIMARY KEY,
                        currency CHAR(3) NOT NULL,
                        balance NUMERIC(19,4) NOT NULL,
                        purchasing_power NUMERIC(19,4) NOT NULL,
                        version BIGINT NOT NULL DEFAULT 1)""");
            statement.execute("""
                    CREATE TABLE orders (
                        order_id INTEGER PRIMARY KEY,
                        account_id INTEGER NOT NULL REFERENCES account(account_id),
                        order_status VARCHAR(20) NOT NULL,
                        price NUMERIC(19,4) NOT NULL CHECK (price > 0))""");
            statement.execute("""
                    CREATE TABLE holdings (
                        holding_id INTEGER PRIMARY KEY,
                        account_id INTEGER NOT NULL REFERENCES account(account_id),
                        purchase_price NUMERIC(19,4) NOT NULL CHECK (purchase_price >= 0))""");
            statement.execute("""
                    INSERT INTO account VALUES
                        (1001, 'EUR', 25000.0000, 18000.0000, 7),
                        (1002, 'USD', 100.0000, 100.0000, 1)""");
            // The very file the service runs at start-up.
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("preferences-schema.sql"));
        }
    }

    private static CustomerPreferences everythingChanged() {
        return new CustomerPreferences(
                "INR",
                EnumSet.of(NotificationChannel.SMS, NotificationChannel.EMAIL),
                EnumSet.of(NotificationCategory.WATCHLIST_ALERTS),
                DateFormatOption.DD_MONTH_YYYY,
                TimeFormatOption.H24,
                NumberFormatOption.IN,
                true,
                ThemeOption.DARK,
                LandingPage.POSITIONS,
                OrderTypeOption.LIMIT);
    }

    @Test
    void anAccountThatNeverSavedHasNoRow() {
        try (SqlSession session = sessions.openSession()) {
            assertEquals(Optional.empty(), session.getMapper(PreferencesMapper.class).selectByAccountId(1001L));
        }
    }

    @Test
    void aSavedDocumentComesBackFieldForField() {
        try (SqlSession session = sessions.openSession(true)) {
            PreferencesMapper mapper = session.getMapper(PreferencesMapper.class);

            mapper.upsert(PreferenceRow.of(1001L, everythingChanged()));
            PreferenceRow stored = mapper.selectByAccountId(1001L).orElseThrow();

            assertEquals(1001L, stored.accountId());
            assertEquals(everythingChanged(), stored.toPreferences());
            assertNotNull(stored.updatedAt());
        }
    }

    @Test
    void aSecondSaveReplacesTheFirstAndKeepsOneRow() throws Exception {
        try (SqlSession session = sessions.openSession(true)) {
            PreferencesMapper mapper = session.getMapper(PreferencesMapper.class);
            mapper.upsert(PreferenceRow.of(1001L, everythingChanged()));
            PreferenceRow first = mapper.selectByAccountId(1001L).orElseThrow();
            Thread.sleep(15);

            mapper.upsert(PreferenceRow.of(1001L, CustomerPreferences.defaults("EUR")));
            PreferenceRow second = mapper.selectByAccountId(1001L).orElseThrow();

            assertEquals(CustomerPreferences.defaults("EUR"), second.toPreferences());
            assertTrue(second.updatedAt().isAfter(first.updatedAt()), "updated_at moves forward");
        }
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT count(*) FROM customer_preference")) {
            rows.next();
            assertEquals(1, rows.getInt(1));
        }
    }

    @Test
    void noNotificationsSurvivesTheRoundTrip() {
        try (SqlSession session = sessions.openSession(true)) {
            PreferencesMapper mapper = session.getMapper(PreferencesMapper.class);
            CustomerPreferences silent = new CustomerPreferences(
                    "USD", EnumSet.noneOf(NotificationChannel.class), EnumSet.noneOf(NotificationCategory.class),
                    DateFormatOption.MON_DD_YYYY, TimeFormatOption.H12, NumberFormatOption.US, false,
                    ThemeOption.SYSTEM, LandingPage.DASHBOARD, OrderTypeOption.MARKET);

            mapper.upsert(PreferenceRow.of(1002L, silent));

            CustomerPreferences back = mapper.selectByAccountId(1002L).orElseThrow().toPreferences();
            assertTrue(back.channels().isEmpty());
            assertFalse(back.categories().contains(NotificationCategory.ORDER_STATUS));
        }
    }

    @Test
    void theDatabaseRefusesAnAccountThatDoesNotExist() {
        try (SqlSession session = sessions.openSession(true)) {
            PreferencesMapper mapper = session.getMapper(PreferencesMapper.class);

            assertThrows(Exception.class, () -> mapper.upsert(PreferenceRow.of(9999L, everythingChanged())));
        }
    }

    @Test
    void theDatabaseRefusesAValueOutsideTheAllowedOptions() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("INSERT INTO customer_preference (account_id) VALUES (1001)");

            assertThrows(java.sql.SQLException.class,
                    () -> statement.execute("UPDATE customer_preference SET date_format = 'WHENEVER'"));
            assertThrows(java.sql.SQLException.class,
                    () -> statement.execute("UPDATE customer_preference SET preferred_currency = 'usd'"));
        }
    }

    // ---- changing the account currency ------------------------------------------------------------------------------

    private static void run(String sql) throws Exception {
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private static java.math.BigDecimal query(String sql) throws Exception {
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement();
             var rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getBigDecimal(1);
        }
    }

    @Test
    void readsTheAccountsMoneyForUpdate() {
        try (SqlSession session = sessions.openSession()) {
            var money = session.getMapper(PreferencesMapper.class).selectAccountMoneyForUpdate(1001L).orElseThrow();

            assertEquals("EUR", money.currency());
            assertEquals(0, new java.math.BigDecimal("25000").compareTo(money.balance()));
            assertEquals(0, new java.math.BigDecimal("18000").compareTo(money.purchasingPower()));
            assertEquals(7L, money.version());
        }
    }

    @Test
    void countsOnlyOrdersThatAreStillNew() throws Exception {
        run("INSERT INTO orders VALUES (1, 1001, 'NEW', 10), (2, 1001, 'FILLED', 10), (3, 1001, 'CANCELLED', 10),"
                + " (4, 1001, 'REJECTED', 10), (5, 1002, 'NEW', 10)");
        try (SqlSession session = sessions.openSession()) {
            assertEquals(1L, session.getMapper(PreferencesMapper.class).countOpenOrders(1001L));
            assertEquals(0L, session.getMapper(PreferencesMapper.class).countOpenOrders(9999L));
        }
    }

    @Test
    void movesTheAccountToTheNewCurrencyAndBumpsTheVersion() throws Exception {
        try (SqlSession session = sessions.openSession(true)) {
            int updated = session.getMapper(PreferencesMapper.class).updateAccountCurrency(
                    1001L, "USD", new java.math.BigDecimal("27500.0000"), new java.math.BigDecimal("19800.0000"), 7L);

            assertEquals(1, updated);
        }
        assertEquals(0, new java.math.BigDecimal("27500").compareTo(query("SELECT balance FROM account WHERE account_id = 1001")));
        assertEquals(0, new java.math.BigDecimal("19800").compareTo(query("SELECT purchasing_power FROM account WHERE account_id = 1001")));
        assertEquals(0, new java.math.BigDecimal("8").compareTo(query("SELECT version FROM account WHERE account_id = 1001")));
        try (Connection connection = DriverManager.getConnection(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA, user, password);
             Statement statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT currency FROM account WHERE account_id = 1001")) {
            rows.next();
            assertEquals("USD", rows.getString(1).trim());
        }
    }

    @Test
    void aStaleVersionChangesNothing() throws Exception {
        try (SqlSession session = sessions.openSession(true)) {
            int updated = session.getMapper(PreferencesMapper.class).updateAccountCurrency(
                    1001L, "USD", java.math.BigDecimal.ONE, java.math.BigDecimal.ONE, 6L);

            assertEquals(0, updated);
        }
        assertEquals(0, new java.math.BigDecimal("25000").compareTo(query("SELECT balance FROM account WHERE account_id = 1001")));
    }

    @Test
    void convertsOnlyThisAccountsOrderAndHoldingPrices() throws Exception {
        run("INSERT INTO orders VALUES (1, 1001, 'FILLED', 200.0000), (2, 1001, 'FILLED', 0.0001), (3, 1002, 'FILLED', 50.0000)");
        run("INSERT INTO holdings VALUES (1, 1001, 175.5000), (2, 1001, 0.0000), (3, 1002, 80.0000)");
        try (SqlSession session = sessions.openSession(true)) {
            PreferencesMapper mapper = session.getMapper(PreferencesMapper.class);
            assertEquals(2, mapper.convertOrderPrices(1001L, new java.math.BigDecimal("1.0850123456789012")));
            assertEquals(2, mapper.convertHoldingPrices(1001L, new java.math.BigDecimal("1.0850123456789012")));
        }

        // 200 * 1.0850123456789012 = 217.0025 (4 d.p.); a price that would round to zero stays at the 0.0001 minimum
        assertEquals(0, new java.math.BigDecimal("217.0025").compareTo(query("SELECT price FROM orders WHERE order_id = 1")));
        assertEquals(0, new java.math.BigDecimal("0.0001").compareTo(query("SELECT price FROM orders WHERE order_id = 2")));
        assertEquals(0, new java.math.BigDecimal("190.4197").compareTo(query("SELECT purchase_price FROM holdings WHERE holding_id = 1")));
        assertEquals(0, java.math.BigDecimal.ZERO.compareTo(query("SELECT purchase_price FROM holdings WHERE holding_id = 2")));
        // another account's amounts are untouched
        assertEquals(0, new java.math.BigDecimal("50").compareTo(query("SELECT price FROM orders WHERE order_id = 3")));
        assertEquals(0, new java.math.BigDecimal("80").compareTo(query("SELECT purchase_price FROM holdings WHERE holding_id = 3")));
    }
}
