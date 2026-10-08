package org.example.backend.service;

import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.events.OrderPlacedAfterCommitListener;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The email and phone number given at account set-up are stored on the account row, in the same transaction. */
class TradeServiceAccountContactTest {

    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final TradeService tradeService = new TradeService(
            accountMapper,
            mock(HoldingMapper.class),
            mock(InstrumentMapper.class),
            mock(OrderMapper.class),
            mock(OrderPlacedAfterCommitListener.class),
            mock(CurrencyConversionService.class),
            new org.example.backend.service.OpeningBalanceMinimums(new org.springframework.mock.env.MockEnvironment()));

    @Test
    void theEmailAndPhoneNumberAreStoredOnTheNewAccountAfterItIsInserted() {
        when(accountMapper.countAccountsByUserId(1000)).thenReturn(0L);
        when(accountMapper.nextAccountId()).thenReturn(1011L);

        tradeService.createAccountForAuth(1000L, new CreateAccountRequest(
                "Alice Example", " +353 1 555 0100 ", " alice@example.com ", null, new BigDecimal("25000"), null));

        var order = inOrder(accountMapper);
        order.verify(accountMapper).insertAccount(org.mockito.ArgumentMatchers.any());
        order.verify(accountMapper).updateAccountContact(1011, "alice@example.com", "+353 1 555 0100");
    }

    @Test
    void nothingIsStoredWhenTheUserAlreadyHasAnAccount() {
        when(accountMapper.countAccountsByUserId(1000)).thenReturn(1L);

        org.junit.jupiter.api.Assertions.assertThrows(
                org.example.backend.exceptions.AccountLinkConflictException.class,
                () -> tradeService.createAccountForAuth(1000L, new CreateAccountRequest(
                        "Alice Example", "+353 1 555 0100", "alice@example.com", null, null, null)));

        verify(accountMapper, never()).updateAccountContact(anyInt(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
