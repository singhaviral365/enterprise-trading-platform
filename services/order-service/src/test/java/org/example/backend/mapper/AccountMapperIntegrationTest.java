package org.example.backend.mapper;

import org.example.backend.entities.Account;
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
class AccountMapperIntegrationTest extends PostgresIntegrationSupport {

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        resetSchema(jdbcTemplate);
        jdbcTemplate.update("INSERT INTO client (client_id, client_name) VALUES (11, 'Priya Menon'), (12, 'Rahul Sharma')");
    }

    @Test
    void insertAndSelectByIdWorks() {
        Account account = new Account(
                1001,
                "ACC-001001",
                LocalDate.of(2024, 1, 1),
                new BigDecimal("24500.75"),
                new BigDecimal("24500.75"),
                AccountStatus.ACTIVE,
                "USD",
                1L,
                null,
                null,
                11);

        assertEquals(1, accountMapper.insertAccount(account));

        Optional<Account> found = accountMapper.selectAccountById(1001);
        assertTrue(found.isPresent());
        assertEquals("ACC-001001", found.get().getAccountNumber());
        assertEquals(AccountStatus.ACTIVE, found.get().getAccountStatus());
    }

    @Test
    void selectByStatusAndOptimisticLockingWork() {
        Account active = new Account(1002, "ACC-001002", LocalDate.of(2024, 1, 2),
                new BigDecimal("20000.00"), new BigDecimal("20000.00"), AccountStatus.ACTIVE,
                "USD", 1L, null, null, 11);
        Account suspended = new Account(1003, "ACC-001003", LocalDate.of(2024, 1, 3),
                new BigDecimal("30000.00"), new BigDecimal("30000.00"), AccountStatus.SUSPENDED,
                "USD", 1L, null, null, 12);

        accountMapper.insertAccount(active);
        accountMapper.insertAccount(suspended);

        List<Account> activeAccounts = accountMapper.selectAccountsByStatus(AccountStatus.ACTIVE);
        assertEquals(1, activeAccounts.size());
        assertEquals(1002, activeAccounts.get(0).getAccountId());

        assertEquals(1, accountMapper.updateAccountBalanceWithVersion(1002, new BigDecimal("15000.0000"), 1L));
        assertEquals(0, accountMapper.updateAccountBalanceWithVersion(1002, new BigDecimal("12000.0000"), 1L));
    }

    @Test
    void invalidForeignKeyRaisesConstraintViolation() {
        Account invalid = new Account(
                1004,
                "ACC-001004",
                LocalDate.of(2024, 1, 4),
                new BigDecimal("1000.00"),
                new BigDecimal("1000.00"),
                AccountStatus.ACTIVE,
                "USD",
                1L,
                null,
                null,
                9999);

        assertThrows(DataIntegrityViolationException.class, () -> accountMapper.insertAccount(invalid));
    }
}
