package org.example.trade_executor.strategy;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.trade_executor.fx.CurrencyConversionService;
import org.example.trade_executor.fx.ExchangeRateUnavailableException;
import org.example.trade_executor.strategy.OrderApiClient.Duplicate;
import org.example.trade_executor.strategy.OrderApiClient.Placed;
import org.example.trade_executor.strategy.OrderApiClient.Refused;
import org.example.trade_executor.strategy.OrderApiClient.Unavailable;
import org.example.trade_executor.strategy.config.StrategySettings;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.RunOutcome;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.example.trade_executor.strategy.model.TriggerDirection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The whole decision to trade, one step at a time: what each step lets through and what each stops. The two that matter most
 * are the claim (nothing is placed unless it is won) and the last look before the order leaves (a switch-off during the run
 * still stops it).
 */
class StrategyWorkerTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-07T10:00:00Z");

    private StrategyMapper strategies;
    private StrategyRunRecorder recorder;
    private AccountMapper accounts;
    private HoldingMapper holdings;
    private CurrencyConversionService currencies;
    private ExecutorTokenMinter tokens;
    private OrderApiClient orderApi;
    private StrategySettings settings;
    private StrategyWorker worker;

    @BeforeEach
    void setUp() {
        strategies = mock(StrategyMapper.class);
        recorder = mock(StrategyRunRecorder.class);
        accounts = mock(AccountMapper.class);
        holdings = mock(HoldingMapper.class);
        currencies = mock(CurrencyConversionService.class);
        tokens = mock(ExecutorTokenMinter.class);
        orderApi = mock(OrderApiClient.class);
        settings = mock(StrategySettings.class);

        when(settings.enabled()).thenReturn(true);
        when(settings.maxQuoteAge()).thenReturn(Duration.ofSeconds(180));
        when(settings.demoDelayMillis()).thenReturn(0L);
        when(tokens.isConfigured()).thenReturn(true);
        when(tokens.mint(anyLong(), anyLong())).thenReturn("the.signed.token");
        when(accounts.selectAccountById(1001)).thenReturn(Optional.of(account(AccountStatus.ACTIVE)));
        when(holdings.selectHoldingByAccountAndInstrument(anyInt(), anyInt())).thenReturn(Optional.empty());
        when(currencies.convert(any(), anyString(), anyString())).thenAnswer(call -> call.getArgument(0));
        when(strategies.claim(5001)).thenReturn(1);
        when(strategies.confirmClaim(5001)).thenReturn(1);
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Placed(77));

        worker = new StrategyWorker(strategies, recorder, accounts, holdings, currencies, tokens, orderApi, settings,
                Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
    }

    private static int anyInt() {
        return org.mockito.ArgumentMatchers.anyInt();
    }

    private static Account account(AccountStatus status) {
        return new Account(1001, "ACC000001001", LocalDate.parse("2025-01-01"), new BigDecimal("10000.0000"),
                new BigDecimal("10000.0000"), status, "USD", 1, null, null, 1004);
    }

    /** Buy 50 AAPL when the price is at or below 150; armed, no runs yet; up to 10,000 an order and a holding of 200. */
    private static RunnableStrategy buyBelow() {
        return strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", true, 0, null, null);
    }

    private static RunnableStrategy strategy(
            OrderSide side, TriggerDirection direction, String trigger, boolean armed, int executions,
            OffsetDateTime validFrom, OffsetDateTime validUntil) {
        return new RunnableStrategy(5001, 1001, 1004, 2001, "AAPL", "USD", side, 50, direction, new BigDecimal(trigger), armed,
                validFrom, validUntil, new BigDecimal("10000"), 200, 3, 3, executions, 0);
    }

    private static StrategyQuote quote(String price) {
        return new StrategyQuote("AAPL", new BigDecimal(price), NOW.minusSeconds(20));
    }

    private void waiting(RunnableStrategy... waiting) {
        when(strategies.selectActiveForTicker("AAPL")).thenReturn(List.of(waiting));
    }

    // ---------------------------------------------------------------- before the claim

    @Test
    void withTheKillSwitchOffNothingIsReadClaimedOrPlaced() {
        when(settings.enabled()).thenReturn(false);
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verifyNoInteractions(strategies, orderApi, tokens, recorder);
    }

    @Test
    void anUnArmedStrategyIsArmedByAQuoteOnTheSafeSideAndNeverFiresOnIt() {
        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", false, 0, null, null));

        worker.onQuote(quote("160"));

        verify(strategies).arm(5001);
        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi);
    }

    @Test
    void anUnArmedStrategyIsNotArmedNorFiredByAQuoteAlreadyPastItsLevel() {
        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", false, 0, null, null));

        worker.onQuote(quote("140"));

        verify(strategies, never()).arm(anyLong());
        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi);
    }

    @Test
    void anArmedStrategyWhoseLevelThePriceHasNotReachedDoesNothing() {
        waiting(buyBelow());

        worker.onQuote(quote("150.01"));

        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi, recorder);
    }

    @Test
    void thePriceExactlyAtTheLevelFiresIt() {
        waiting(buyBelow());

        worker.onQuote(quote("150.00"));

        verify(strategies).claim(5001);
    }

    @Test
    void anAboveStrategyFiresOnARiseAndNotOnAFall() {
        waiting(strategy(OrderSide.SELL, TriggerDirection.ABOVE, "200", true, 0, null, null));
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(1, 100, new BigDecimal("150"), 1001, 2001)));

        worker.onQuote(quote("199.99"));
        verify(strategies, never()).claim(anyLong());

        worker.onQuote(quote("200.00"));
        verify(strategies).claim(5001);
    }

    @Test
    void aQuoteTooOldToTradeOnIsRecordedAndNothingIsClaimed() {
        waiting(buyBelow());

        worker.onQuote(new StrategyQuote("AAPL", new BigDecimal("149"), NOW.minusSeconds(181)));

        verify(recorder).stale(any(), any());
        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi);
    }

    @Test
    void aStrategyOutsideItsWindowIsLeftAlone() {
        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", true, 0, NOW.plusMinutes(5), null));
        worker.onQuote(quote("149"));

        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", true, 0, null, NOW));
        worker.onQuote(quote("149"));

        verify(strategies, never()).claim(anyLong());
    }

    @Test
    void anAccountThatIsNotActiveIsNotTradedForAndTheStrategyIsLeftAsItIs() {
        when(accounts.selectAccountById(1001)).thenReturn(Optional.of(account(AccountStatus.SUSPENDED)));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi, recorder);
    }

    @Test
    void withoutATokenSecretNothingIsClaimedRatherThanClaimedAndFailed() {
        when(tokens.isConfigured()).thenReturn(false);
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(strategies, never()).claim(anyLong());
        verifyNoInteractions(orderApi);
    }

    // ---------------------------------------------------------------- the claim

    @Test
    void aStrategyThatCannotBeClaimedPlacesNothing() {
        when(strategies.claim(5001)).thenReturn(0);
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verifyNoInteractions(orderApi);
        verify(tokens, never()).mint(anyLong(), anyLong());
        verify(recorder, never()).ordered(any(), any(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
        verify(recorder, never()).failed(any(), any(), any(), anyString());
    }

    // ---------------------------------------------------------------- the limits

    @Test
    void anOrderOverTheCustomersSpendLimitIsHeldBackAndNeverSent() {
        // 50 x 250 = 12,500, over the 10,000 limit (the trigger is above the quote only to keep it simple).
        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "300", true, 0, null, null));

        worker.onQuote(quote("250"));

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(recorder).failed(any(), any(), eq(RunOutcome.BLOCKED_LIMIT), detail.capture());
        assertTrue(detail.getValue().contains("12500.00 USD"), detail.getValue());
        assertTrue(detail.getValue().contains("limit of 10000"), detail.getValue());
        verifyNoInteractions(orderApi);
        verify(tokens, never()).mint(anyLong(), anyLong());
    }

    @Test
    void theSpendLimitIsCheckedInTheAccountsCurrency() {
        when(accounts.selectAccountById(1001)).thenReturn(Optional.of(new Account(1001, "ACC000001001",
                LocalDate.parse("2025-01-01"), BigDecimal.TEN, BigDecimal.TEN, AccountStatus.ACTIVE, "INR", 1, null, null, 1004)));
        when(currencies.convert(any(), eq("USD"), eq("INR"))).thenReturn(new BigDecimal("12000"));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        // 50 x 12,000 = 600,000 rupees, far over the limit, though 50 x 149 dollars would not have been.
        verify(recorder).failed(any(), any(), eq(RunOutcome.BLOCKED_LIMIT), anyString());
        verifyNoInteractions(orderApi);
    }

    @Test
    void aBuyThatWouldBuildAPositionOverTheLimitIsHeldBack() {
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(1, 160, new BigDecimal("150"), 1001, 2001)));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(recorder).failed(any(), any(), eq(RunOutcome.BLOCKED_LIMIT), detail.capture());
        assertTrue(detail.getValue().contains("210 units"), detail.getValue());
        verifyNoInteractions(orderApi);
    }

    @Test
    void aBuyThatLandsExactlyOnThePositionLimitIsAllowed() {
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(1, 150, new BigDecimal("150"), 1001, 2001)));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(orderApi).placeMarketOrder(any(), anyString());
    }

    @Test
    void aSellOfMoreThanIsHeldIsHeldBack() {
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(1, 49, new BigDecimal("150"), 1001, 2001)));
        waiting(strategy(OrderSide.SELL, TriggerDirection.ABOVE, "200", true, 0, null, null));

        worker.onQuote(quote("201"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.BLOCKED_LIMIT), anyString());
        verifyNoInteractions(orderApi);
    }

    @Test
    void aSellOfNothingHeldIsHeldBack() {
        waiting(strategy(OrderSide.SELL, TriggerDirection.ABOVE, "200", true, 0, null, null));

        worker.onQuote(quote("201"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.BLOCKED_LIMIT), anyString());
        verifyNoInteractions(orderApi);
    }

    @Test
    void anExchangeRateThatCannotBeGotIsAFailureNotAGuess() {
        when(currencies.convert(any(), anyString(), anyString())).thenThrow(new ExchangeRateUnavailableException("down"));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.API_ERROR), eq("The exchange rate was not available"));
        verifyNoInteractions(orderApi);
    }

    // ---------------------------------------------------------------- the order

    @Test
    void aTriggeredStrategyIsClaimedThenConfirmedThenPlacedAndThenRecorded() {
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        InOrder order = inOrder(strategies, tokens, orderApi, recorder);
        order.verify(strategies).claim(5001);
        order.verify(tokens).mint(1004, 5001);
        order.verify(strategies).confirmClaim(5001);
        order.verify(orderApi).placeMarketOrder(any(), eq("the.signed.token"));
        order.verify(recorder).ordered(any(), any(), eq(77L), eq(false));
    }

    @Test
    void theTokenIsMintedForTheStrategysOwnerAndTheOrderCarriesTheRunsKey() {
        waiting(strategy(OrderSide.BUY, TriggerDirection.BELOW, "150", true, 1, null, null));

        worker.onQuote(quote("149"));

        verify(tokens).mint(1004, 5001);
        ArgumentCaptor<RunnableStrategy> sent = ArgumentCaptor.forClass(RunnableStrategy.class);
        verify(orderApi).placeMarketOrder(sent.capture(), anyString());
        assertEquals("strat-5001-2", sent.getValue().orderKey());
    }

    @Test
    void aStrategySwitchedOffAfterTheClaimButBeforeTheOrderLeavesPlacesNothing() {
        when(strategies.confirmClaim(5001)).thenReturn(0);
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).disabledBeforeSend(any(), any());
        verifyNoInteractions(orderApi);
        verify(recorder, never()).ordered(any(), any(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
        verify(recorder, never()).failed(any(), any(), any(), anyString());
    }

    @Test
    void theDemonstrationPauseHoldsTheClaimLongEnoughForASwitchOffToLandAndStopTheOrder() {
        when(settings.demoDelayMillis()).thenReturn(150L);
        // The customer switches the strategy off while the worker is paused: the last look then finds it no longer claimed.
        when(strategies.confirmClaim(5001)).thenAnswer(call -> 0);
        waiting(buyBelow());

        long started = System.nanoTime();
        worker.onQuote(quote("149"));
        long took = Duration.ofNanos(System.nanoTime() - started).toMillis();

        assertTrue(took >= 140, "the claim was held for " + took + " ms");
        verify(strategies).claim(5001);
        verifyNoInteractions(orderApi);
    }

    @Test
    void aDuplicateAnswerIsLinkedToTheOrderAnEarlierAttemptPlaced() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Duplicate());
        when(strategies.selectOrderByKey("strat-5001-1")).thenReturn(Optional.of(new ExistingOrder(55, "NEW")));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).ordered(any(), any(), eq(55L), eq(true));
        verify(recorder, never()).failed(any(), any(), any(), anyString());
    }

    @Test
    void aDuplicateWhoseOriginalCannotBeFoundIsAFailureSoItIsLookedAtNotIgnored() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Duplicate());
        when(strategies.selectOrderByKey(anyString())).thenReturn(Optional.empty());
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.API_ERROR), anyString());
    }

    @Test
    void anOrderTheRouteRefusesIsAFailureWithItsCodeButNotItsWords() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Refused(400, "ORD-400"));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.REJECTED), eq("The order was refused (HTTP 400 ORD-400)"));
    }

    @Test
    void anOrderRouteThatCannotBeReachedIsAFailureAndNothingIsRecordedAsPlaced() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Unavailable("the order service could not be reached"));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.API_ERROR), eq("The order was not placed: the order service could not be reached"));
        verify(recorder, never()).ordered(any(), any(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void anUnexpectedErrorAfterTheClaimGivesTheClaimBackAsAFailure() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenThrow(new IllegalStateException("bug"));
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), eq(RunOutcome.API_ERROR), eq("An unexpected error stopped this run"));
    }

    @Test
    void aFailureToRecordTheFailureIsSurvivedAndLeftForTheSweeper() {
        when(orderApi.placeMarketOrder(any(), anyString())).thenReturn(new Unavailable("x"));
        doThrow(new IllegalStateException("database down")).when(recorder).failed(any(), any(), any(), anyString());
        waiting(buyBelow());

        worker.onQuote(quote("149"));

        verify(recorder).failed(any(), any(), any(), anyString());
    }

    @Test
    void oneStrategysTroubleNeverStopsTheOthersOnTheSameQuote() {
        RunnableStrategy first = buyBelow();
        RunnableStrategy second = new RunnableStrategy(5002, 1001, 1004, 2001, "AAPL", "USD", OrderSide.BUY, 10,
                TriggerDirection.BELOW, new BigDecimal("150"), true, null, null, new BigDecimal("10000"), 200, 1, 3, 0, 0);
        waiting(first, second);
        when(strategies.claim(5001)).thenThrow(new IllegalStateException("database blip"));
        when(strategies.claim(5002)).thenReturn(1);
        when(strategies.confirmClaim(5002)).thenReturn(1);

        worker.onQuote(quote("149"));

        verify(orderApi, times(1)).placeMarketOrder(any(), anyString());
        ArgumentCaptor<RunnableStrategy> placed = ArgumentCaptor.forClass(RunnableStrategy.class);
        verify(orderApi).placeMarketOrder(placed.capture(), anyString());
        assertEquals(5002, placed.getValue().strategyId());
    }

    @Test
    void aStrategyWithNothingWaitingOnTheInstrumentCostsOneReadAndNothingElse() {
        waiting();

        worker.onQuote(quote("149"));

        verify(strategies).selectActiveForTicker("AAPL");
        verifyNoInteractions(orderApi, tokens, recorder, accounts, holdings);
    }
}
