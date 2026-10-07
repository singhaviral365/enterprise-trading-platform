package org.example.backend.strategy.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.strategy.StrategyFixtures;
import org.example.backend.strategy.config.StrategyLimits;
import org.example.backend.strategy.dto.CreateStrategyRequest;
import org.example.backend.strategy.dto.StrategyResponse;
import org.example.backend.strategy.exceptions.StrategyAccessDeniedException;
import org.example.backend.strategy.exceptions.StrategyAlreadyReachedException;
import org.example.backend.strategy.exceptions.StrategyLimitExceededException;
import org.example.backend.strategy.exceptions.StrategyNotChangeableException;
import org.example.backend.strategy.exceptions.StrategyNotFoundException;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.NewStrategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.example.backend.strategy.model.TriggerDirection;
import org.example.backend.watchlist.price.Quote;
import org.example.backend.watchlist.price.QuoteSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategyServiceTest {

    private static final long USER = 7;
    private static final long ACCOUNT = 1001;
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-07T10:00:00Z");

    private StrategyMapper mapper;
    private AccountMapper accounts;
    private InstrumentMapper instruments;
    private QuoteSource quotes;
    private StrategyService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StrategyMapper.class);
        accounts = mock(AccountMapper.class);
        instruments = mock(InstrumentMapper.class);
        quotes = mock(QuoteSource.class);

        when(accounts.accountExists((int) ACCOUNT)).thenReturn(true);
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn((int) USER);
        when(accounts.selectAccountById((int) ACCOUNT)).thenReturn(Optional.of(account(AccountStatus.ACTIVE)));
        when(instruments.selectInstrumentByTicker("AAPL")).thenReturn(Optional.of(instrument(InstrumentStatus.TRADING)));
        when(quotes.latest(any())).thenReturn(Map.of());
        when(mapper.insertIfUnderLimit(any(), anyInt())).thenReturn(Optional.of(5001L));
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));

        service = new StrategyService(
                new StrategyAccess(mapper, accounts), mapper, accounts, instruments, quotes,
                new StrategyLimits(20, 1_000_000, new BigDecimal("10000000"), 10_000_000, 366, 300),
                Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
    }

    private static Account account(AccountStatus status) {
        return new Account(1001, "ACC000001001", LocalDate.parse("2025-01-01"), new BigDecimal("10000.0000"),
                new BigDecimal("10000.0000"), status, "USD", 1, null, null, 7);
    }

    private static Instrument instrument(InstrumentStatus status) {
        return new Instrument(2001, "AAPL", "Apple Inc.", InstrumentAssetClass.EQUITY, status, "USD", null);
    }

    private static CreateStrategyRequest request() {
        return new CreateStrategyRequest(ACCOUNT, "aapl", OrderSide.BUY, 50L, TriggerDirection.BELOW,
                new BigDecimal("150"), null, null, new BigDecimal("10000"), 200L, null, null);
    }

    private static CreateStrategyRequest with(
            OrderSide side, long quantity, String trigger, OffsetDateTime until, String maxOrder, long maxPosition) {
        return new CreateStrategyRequest(ACCOUNT, "AAPL", side, quantity, TriggerDirection.BELOW, new BigDecimal(trigger),
                null, until, new BigDecimal(maxOrder), maxPosition, null, null);
    }

    private void priceIs(String price, OffsetDateTime at) {
        when(quotes.latest(any())).thenReturn(Map.of("AAPL", new Quote("AAPL", new BigDecimal(price), at)));
    }

    // ---------------------------------------------------------------- create

    @Test
    void createsAnActiveStrategyWithTheDefaultsForWhatWasLeftOut() {
        StrategyResponse response = service.create(USER, request());

        assertEquals(5001, response.strategyId());
        ArgumentCaptor<NewStrategy> created = ArgumentCaptor.forClass(NewStrategy.class);
        verify(mapper).insertIfUnderLimit(created.capture(), eq(20));
        assertEquals(2001, created.getValue().instrumentId());
        assertEquals(1, created.getValue().maxExecutions());
        assertEquals(3, created.getValue().maxFailures());
        assertEquals(new BigDecimal("10000"), created.getValue().maxOrderValue());
        assertEquals(200, created.getValue().maxPositionQty());
        verify(mapper).lockAccountForStrategies(ACCOUNT);
    }

    @Test
    void theSymbolIsMatchedIgnoringCaseAndSurroundingSpace() {
        service.create(USER, new CreateStrategyRequest(ACCOUNT, " aapl ", OrderSide.BUY, 50L, TriggerDirection.BELOW,
                new BigDecimal("150"), null, null, new BigDecimal("10000"), 200L, null, null));

        verify(instruments).selectInstrumentByTicker("AAPL");
    }

    @Test
    void anAccountThatIsNotTheTokensUsersIsRefusedBeforeAnythingIsWritten() {
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn(99);

        StrategyAccessDeniedException ex = assertThrows(StrategyAccessDeniedException.class, () -> service.create(USER, request()));

        assertEquals("ACC-403", ex.getErrorCode());
        verify(mapper, never()).insertIfUnderLimit(any(), anyInt());
    }

    @Test
    void anUnknownAccountIsNotFound() {
        when(accounts.accountExists((int) ACCOUNT)).thenReturn(false);

        assertThrows(AccountNotFoundException.class, () -> service.create(USER, request()));
    }

    @Test
    void anAccountThatIsNotActiveCannotGetANewStrategy() {
        when(accounts.selectAccountById((int) ACCOUNT)).thenReturn(Optional.of(account(AccountStatus.SUSPENDED)));

        assertThrows(AccountNotActiveException.class, () -> service.create(USER, request()));
        verify(mapper, never()).insertIfUnderLimit(any(), anyInt());
    }

    @Test
    void anInstrumentThatDoesNotExistOrCannotBeTradedIsRefused() {
        when(instruments.selectInstrumentByTicker("ZZZZ")).thenReturn(Optional.empty());
        assertThrows(InstrumentNotFoundException.class, () -> service.create(USER, new CreateStrategyRequest(
                ACCOUNT, "ZZZZ", OrderSide.BUY, 1L, TriggerDirection.BELOW, BigDecimal.TEN, null, null, BigDecimal.TEN, 5L, null, null)));

        when(instruments.selectInstrumentByTicker("AAPL")).thenReturn(Optional.of(instrument(InstrumentStatus.HALTED)));
        assertThrows(InstrumentNotFoundException.class, () -> service.create(USER, request()));
    }

    @Test
    void theCustomersLimitsCannotExceedThePlatformsCeilings() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", null, "10000001", 200)));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", null, "10000", 10_000_001)));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 1_000_001, "150", null, "10000", 2_000_000)));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "1000000001", null, "10000", 200)));
        verify(mapper, never()).insertIfUnderLimit(any(), anyInt());
    }

    @Test
    void aBuyThatCouldNeverFitInItsOwnPositionLimitIsRefused() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", null, "10000", 49)));

        // A sell needs no room: it reduces the position.
        service.create(USER, with(OrderSide.SELL, 50, "150", null, "10000", 1));
    }

    @Test
    void thePricesPrecisionIsBounded() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150.12345", null, "10000", 200)));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", null, "10000.123", 200)));
    }

    @Test
    void theEndOfTheWindowMustBeInTheFutureAndNotTooFarAhead() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", NOW.minusMinutes(1), "10000", 200)));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(USER, with(OrderSide.BUY, 50, "150", NOW.plusDays(367), "10000", 200)));

        service.create(USER, with(OrderSide.BUY, 50, "150", NOW.plusDays(30), "10000", 200));
    }

    @Test
    void aTriggerThePriceHasAlreadyReachedIsRefusedSoItNeverTradesTheMomentItIsCreated() {
        priceIs("149.50", NOW.minusSeconds(30));

        StrategyAlreadyReachedException ex = assertThrows(StrategyAlreadyReachedException.class, () -> service.create(USER, request()));

        assertEquals("STR-409", ex.getErrorCode());
        verify(mapper, never()).insertIfUnderLimit(any(), anyInt());
    }

    @Test
    void thePriceExactlyAtTheTriggerCountsAsReached() {
        priceIs("150.00", NOW.minusSeconds(30));

        assertThrows(StrategyAlreadyReachedException.class, () -> service.create(USER, request()));
    }

    @Test
    void anAboveTriggerIsJudgedFromTheOtherSide() {
        priceIs("150.00", NOW.minusSeconds(30));

        service.create(USER, new CreateStrategyRequest(ACCOUNT, "AAPL", OrderSide.SELL, 10L, TriggerDirection.ABOVE,
                new BigDecimal("160"), null, null, new BigDecimal("10000"), 200L, null, null));

        assertThrows(StrategyAlreadyReachedException.class, () -> service.create(USER, new CreateStrategyRequest(
                ACCOUNT, "AAPL", OrderSide.SELL, 10L, TriggerDirection.ABOVE, new BigDecimal("140"), null, null,
                new BigDecimal("10000"), 200L, null, null)));
    }

    @Test
    void aFreshPriceOnTheSafeSideCreatesItArmed() {
        priceIs("155.00", NOW.minusSeconds(30));

        service.create(USER, request());

        ArgumentCaptor<NewStrategy> created = ArgumentCaptor.forClass(NewStrategy.class);
        verify(mapper).insertIfUnderLimit(created.capture(), anyInt());
        assertTrue(created.getValue().armed());
    }

    @Test
    void anOldPriceOnTheSafeSideIsNotTakenAsProofSoItIsCreatedUnArmed() {
        priceIs("155.00", NOW.minusSeconds(3600));

        service.create(USER, request());

        ArgumentCaptor<NewStrategy> created = ArgumentCaptor.forClass(NewStrategy.class);
        verify(mapper).insertIfUnderLimit(created.capture(), anyInt());
        assertFalse(created.getValue().armed());
    }

    @Test
    void whenNoPriceIsKnownItIsCreatedUnArmedAndWaitsForOne() {
        service.create(USER, request());

        ArgumentCaptor<NewStrategy> created = ArgumentCaptor.forClass(NewStrategy.class);
        verify(mapper).insertIfUnderLimit(created.capture(), anyInt());
        assertFalse(created.getValue().armed());
    }

    @Test
    void anAccountAtItsCapCannotOpenAnotherStrategy() {
        when(mapper.insertIfUnderLimit(any(), anyInt())).thenReturn(Optional.empty());

        StrategyLimitExceededException ex = assertThrows(StrategyLimitExceededException.class, () -> service.create(USER, request()));

        assertEquals("STR-422", ex.getErrorCode());
        assertEquals(20, ex.getLimit());
    }

    // ---------------------------------------------------------------- read

    @Test
    void listsOnlyTheAccountsOwnStrategiesAfterCheckingOwnership() {
        when(mapper.selectByAccountId(ACCOUNT)).thenReturn(List.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));

        assertEquals(1, service.list(USER, ACCOUNT).size());

        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn(99);
        assertThrows(StrategyAccessDeniedException.class, () -> service.list(USER, ACCOUNT));
    }

    @Test
    void aStrategyOfAnotherCustomerIsNotFoundSoItsIdIsNotRevealed() {
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn(99);

        assertThrows(StrategyNotFoundException.class, () -> service.get(USER, 5001));
        assertThrows(StrategyNotFoundException.class, () -> service.runs(USER, 5001));
        assertThrows(StrategyNotFoundException.class, () -> service.setEnabled(USER, 5001, false));
        assertThrows(StrategyNotFoundException.class, () -> service.cancel(USER, 5001));
        verify(mapper, never()).disable(anyLong(), anyString());
        verify(mapper, never()).cancel(anyLong(), anyString());
    }

    @Test
    void anIdThatDoesNotExistIsNotFoundToo() {
        when(mapper.selectById(404)).thenReturn(Optional.empty());

        assertThrows(StrategyNotFoundException.class, () -> service.get(USER, 404));
    }

    // ---------------------------------------------------------------- switch off and on

    @Test
    void switchingAnActiveStrategyOffIsOneUpdateAndTheAnswerIsTheNewState() {
        when(mapper.selectById(5001))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)));
        when(mapper.disable(eq(5001L), anyString())).thenReturn(1);

        assertEquals(StrategyStatus.DISABLED, service.setEnabled(USER, 5001, false).status());

        verify(mapper).disable(5001, "Switched off by the customer");
    }

    @Test
    void aStrategyBeingRunRightNowCanStillBeSwitchedOff() {
        when(mapper.selectById(5001))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.EXECUTING)))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)));
        when(mapper.disable(eq(5001L), anyString())).thenReturn(1);

        assertEquals(StrategyStatus.DISABLED, service.setEnabled(USER, 5001, false).status());
    }

    @Test
    void switchingOffWhatIsAlreadyOffChangesNothingAndSucceeds() {
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)));

        assertEquals(StrategyStatus.DISABLED, service.setEnabled(USER, 5001, false).status());

        verify(mapper, never()).disable(anyLong(), anyString());
    }

    @Test
    void aFinishedStrategyCannotBeSwitchedOffOrOn() {
        for (StrategyStatus status : List.of(StrategyStatus.EXECUTED, StrategyStatus.CANCELLED, StrategyStatus.EXPIRED, StrategyStatus.FAILED)) {
            when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(status)));

            assertThrows(StrategyNotChangeableException.class, () -> service.setEnabled(USER, 5001, false), status.name());
            assertThrows(StrategyNotChangeableException.class, () -> service.setEnabled(USER, 5001, true), status.name());
        }
        verify(mapper, never()).disable(anyLong(), anyString());
        verify(mapper, never()).enable(anyLong());
    }

    @Test
    void ifTheUpdateChangesNothingBecauseTheStatusMovedMeanwhileTheCustomerIsToldSo() {
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));
        when(mapper.disable(eq(5001L), anyString())).thenReturn(0);

        assertThrows(StrategyNotChangeableException.class, () -> service.setEnabled(USER, 5001, false));
    }

    @Test
    void switchingASwitchedOffStrategyBackOnReArmsIt() {
        when(mapper.selectById(5001))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));
        when(mapper.enable(5001)).thenReturn(1);

        assertEquals(StrategyStatus.ACTIVE, service.setEnabled(USER, 5001, true).status());
        verify(mapper).enable(5001);
    }

    @Test
    void aSwitchedOffStrategyWhoseWindowClosedCannotBeSwitchedBackOn() {
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)));
        when(mapper.enable(5001)).thenReturn(0);

        assertThrows(StrategyNotChangeableException.class, () -> service.setEnabled(USER, 5001, true));
    }

    @Test
    void switchingOnWhatIsAlreadyActiveChangesNothingAndSucceeds() {
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.ACTIVE)));

        assertEquals(StrategyStatus.ACTIVE, service.setEnabled(USER, 5001, true).status());

        verify(mapper, never()).enable(anyLong());
    }

    // ---------------------------------------------------------------- cancel

    @Test
    void cancellingAnOpenStrategyIsFinal() {
        when(mapper.selectById(5001))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.DISABLED)))
                .thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.CANCELLED)));
        when(mapper.cancel(eq(5001L), anyString())).thenReturn(1);

        assertEquals(StrategyStatus.CANCELLED, service.cancel(USER, 5001).status());
        verify(mapper).cancel(5001, "Cancelled by the customer");
    }

    @Test
    void cancellingAnAlreadyCancelledStrategySucceedsAndAnyOtherFinishedOneDoesNot() {
        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.CANCELLED)));
        assertEquals(StrategyStatus.CANCELLED, service.cancel(USER, 5001).status());

        when(mapper.selectById(5001)).thenReturn(Optional.of(StrategyFixtures.buyBelow(StrategyStatus.EXECUTED)));
        assertThrows(StrategyNotChangeableException.class, () -> service.cancel(USER, 5001));
        verify(mapper, never()).cancel(anyLong(), anyString());
    }

    @Test
    void theTrailIsReadOnlyAfterOwnershipIsChecked() {
        when(mapper.selectRuns(5001, 50)).thenReturn(List.of());

        assertTrue(service.runs(USER, 5001).isEmpty());
        verify(mapper).selectRuns(5001, 50);
    }
}
