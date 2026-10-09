package org.example.backend.service;

import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.dto.CreateAccountResult;
import org.example.backend.entities.Account;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.example.backend.events.OrderPlacedAfterCommitListener;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The account currency is chosen once, when the account is opened, and the smallest opening balance depends on it. */
class TradeServiceAccountCurrencyTest {

    private AccountMapper accountMapper;
    private MockEnvironment environment;
    private TradeService tradeService;

    @BeforeEach
    void setUp() {
        environment = new MockEnvironment();
        freshService();
    }

    private void freshService() {
        accountMapper = mock(AccountMapper.class);
        when(accountMapper.countAccountsByUserId(1000)).thenReturn(0L);
        when(accountMapper.nextAccountId()).thenReturn(1011L);
        tradeService = new TradeService(
                accountMapper,
                mock(HoldingMapper.class),
                mock(InstrumentMapper.class),
                mock(OrderMapper.class),
                mock(OrderPlacedAfterCommitListener.class),
                mock(CurrencyConversionService.class),
                new OpeningBalanceMinimums(environment));
    }

    private static CreateAccountRequest request(String currency, String balance) {
        return new CreateAccountRequest(
                "Alice Example", "+353 1 555 0100", "alice@example.com", null,
                balance == null ? null : new BigDecimal(balance), currency);
    }

    private Account inserted() {
        ArgumentCaptor<Account> account = ArgumentCaptor.forClass(Account.class);
        verify(accountMapper).insertAccount(account.capture());
        return account.getValue();
    }

    @Test
    void anAccountIsOpenedInTheCurrencyChosen() {
        CreateAccountResult result = tradeService.createAccountForAuth(1000L, request("EUR", "25000"));

        assertEquals("EUR", inserted().getCurrency());
        assertEquals("EUR", result.currency());
    }

    @Test
    void noCurrencyMeansUsdAsBefore() {
        CreateAccountResult result = tradeService.createAccountForAuth(1000L, request(null, "25000"));

        assertEquals("USD", inserted().getCurrency());
        assertEquals("USD", result.currency());
    }

    @Test
    void aCurrencyOutsideTheSupportedListIsRefusedBeforeAnythingIsWritten() {
        assertThrows(IllegalArgumentException.class, () -> tradeService.createAccountForAuth(1000L, request("XYZ", "25000")));

        verify(accountMapper, never()).insertAccount(any());
    }

    @Test
    void theOpeningBalanceMinimumDependsOnTheCurrency() {
        assertEquals(new BigDecimal("20000.0000"), openedWith("USD", null));
        assertEquals(new BigDecimal("18000.0000"), openedWith("EUR", null));
        assertEquals(new BigDecimal("3000000.0000"), openedWith("JPY", null));
    }

    private BigDecimal openedWith(String currency, String balance) {
        freshService();
        tradeService.createAccountForAuth(1000L, request(currency, balance));
        return inserted().getBalance();
    }

    @Test
    void aBalanceBelowTheCurrenciesMinimumIsRefusedAndTheMessageNamesTheCurrencyAndTheMinimum() {
        IllegalArgumentException jpy = assertThrows(IllegalArgumentException.class,
                () -> tradeService.createAccountForAuth(1000L, request("JPY", "20000")));
        IllegalArgumentException eur = assertThrows(IllegalArgumentException.class,
                () -> tradeService.createAccountForAuth(1000L, request("EUR", "17999")));

        assertEquals("Opening balance must be at least 3000000 JPY", jpy.getMessage());
        assertEquals("Opening balance must be at least 18000 EUR", eur.getMessage());
        verify(accountMapper, never()).insertAccount(any());
    }

    @Test
    void twentyThousandIsStillEnoughInUsdButNotInInr() {
        assertEquals(new BigDecimal("20000.0000"), openedWith("USD", "20000"));

        freshService();
        assertThrows(IllegalArgumentException.class, () -> tradeService.createAccountForAuth(1000L, request("INR", "20000")));
    }

    @Test
    void aMinimumCanBeOverriddenInConfiguration() {
        environment.setProperty("account.opening.minimum.JPY", "1000000");

        assertEquals(new BigDecimal("1000000.0000"), openedWith("JPY", null));
    }
}
