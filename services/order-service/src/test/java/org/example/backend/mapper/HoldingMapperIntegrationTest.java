package org.example.backend.mapper;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.enums.AccountStatus;
import org.example.backend.support.PostgresIntegrationSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class HoldingMapperIntegrationTest extends PostgresIntegrationSupport {

    @Autowired
    private HoldingMapper holdingMapper;

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

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
        jdbcTemplate.update("INSERT INTO instrument (instrument_id, instrument_ticker, instrument_name, asset_class, instrument_status) VALUES (101, 'ACME', 'Acme Corp', 'EQUITY', 'TRADING'), (102, 'INFY.NS', 'Infosys NSE', 'EQUITY', 'TRADING')");
    }

    @Test
    void insertAndReadHoldingByIdWorks() {
        Holding holding = new Holding(5001, 100L, new BigDecimal("25.50"), 1001, 101);

        assertEquals(1, holdingMapper.insertHolding(holding));

        Optional<Holding> found = holdingMapper.selectHoldingById(5001L);
        assertTrue(found.isPresent());
        assertEquals(100L, found.get().getQuantity());
        assertEquals(101, found.get().getInstrumentId());
    }

    @Test
    void activeHoldingsFilterExcludesZeroQuantity() {
        holdingMapper.insertHolding(new Holding(5002, 100L, new BigDecimal("25.50"), 1001, 101));
        holdingMapper.insertHolding(new Holding(5003, 0L, new BigDecimal("1200.00"), 1001, 102));

        List<Holding> active = holdingMapper.selectActiveHoldingsByAccountId(1001);
        assertEquals(1, active.size());
        assertEquals(101, active.get(0).getInstrumentId());
    }

    @Test
    void duplicateAccountInstrumentRaisesConstraintViolation() {
        holdingMapper.insertHolding(new Holding(5004, 10L, new BigDecimal("10.00"), 1001, 101));

        assertThrows(DataIntegrityViolationException.class,
                () -> holdingMapper.insertHolding(new Holding(5005, 20L, new BigDecimal("11.00"), 1001, 101)));
    }
}
