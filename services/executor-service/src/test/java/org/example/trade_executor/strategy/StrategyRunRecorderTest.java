package org.example.trade_executor.strategy;

import org.example.backend.enums.OrderSide;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.NewRun;
import org.example.trade_executor.strategy.model.RunOutcome;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.example.trade_executor.strategy.model.TriggerDirection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategyRunRecorderTest {

    private static final StrategyQuote QUOTE = new StrategyQuote("AAPL", new BigDecimal("149.8"), OffsetDateTime.parse("2026-10-07T10:00:00Z"));

    private final RunnableStrategy strategy = new RunnableStrategy(5001, 1001, 1004, 2001, "AAPL", "USD", OrderSide.BUY, 50,
            TriggerDirection.BELOW, new BigDecimal("150"), true, null, null, new BigDecimal("10000"), 200, 3, 3, 1, 0);

    private StrategyMapper mapper;
    private StrategyRunRecorder recorder;

    @BeforeEach
    void setUp() {
        mapper = mock(StrategyMapper.class);
        recorder = new StrategyRunRecorder(mapper);
        when(mapper.selectOrderByKey(anyString())).thenReturn(Optional.empty());
    }

    private NewRun written() {
        ArgumentCaptor<NewRun> run = ArgumentCaptor.forClass(NewRun.class);
        verify(mapper).insertRun(run.capture());
        return run.getValue();
    }

    @Test
    void aPlacedOrderIsOnTheTrailAndCountedAsARunWithTheOrderRemembered() {
        recorder.ordered(strategy, QUOTE, 77, false);

        NewRun run = written();
        assertEquals(RunOutcome.ORDERED, run.outcome());
        assertEquals(2, run.runNumber(), "one run already succeeded, so this is the second");
        assertEquals(77L, run.orderId());
        assertEquals(new BigDecimal("149.8"), run.quotePrice());
        verify(mapper).recordSuccess(5001, 77);
    }

    @Test
    void aDuplicateIsRecordedAsSuchAndStillCounted() {
        recorder.ordered(strategy, QUOTE, 55, true);

        assertEquals(RunOutcome.DUPLICATE, written().outcome());
        verify(mapper).recordSuccess(5001, 55);
    }

    @Test
    void aRunAlreadyOnTheTrailDoesNotStopTheStrategyBeingMovedOn() {
        doThrow(new DuplicateKeyException("uq_strategy_run_order")).when(mapper).insertRun(any());

        recorder.ordered(strategy, QUOTE, 77, false);

        verify(mapper).recordSuccess(5001, 77);
    }

    @Test
    void anOrderThatAlreadyEndedBeforeItsRunWasWrittenIsSettledFromTheOrderItself() {
        when(mapper.selectOrderByKey("strat-5001-2")).thenReturn(Optional.of(new ExistingOrder(77, "FILLED")));

        recorder.ordered(strategy, QUOTE, 77, false);

        verify(mapper).settleRun(5001, 2, "FILLED");
    }

    @Test
    void anOrderStillWorkingIsLeftForItsTradeEventToSettle() {
        when(mapper.selectOrderByKey("strat-5001-2")).thenReturn(Optional.of(new ExistingOrder(77, "NEW")));

        recorder.ordered(strategy, QUOTE, 77, false);

        verify(mapper, never()).settleRun(anyLong(), anyInt(), anyString());
    }

    @Test
    void aFailureIsOnTheTrailWithItsReasonAndCountsAgainstTheStrategy() {
        when(mapper.recordFailure(5001, "over the limit")).thenReturn(Optional.of("ACTIVE"));

        Optional<String> status = recorder.failed(strategy, QUOTE, RunOutcome.BLOCKED_LIMIT, "over the limit");

        NewRun run = written();
        assertEquals(RunOutcome.BLOCKED_LIMIT, run.outcome());
        assertEquals("over the limit", run.detail());
        assertEquals(null, run.orderId());
        assertEquals(Optional.of("ACTIVE"), status);
    }

    @Test
    void theLastAllowedFailureStopsTheStrategy() {
        when(mapper.recordFailure(anyLong(), anyString())).thenReturn(Optional.of("FAILED"));

        assertEquals(Optional.of("FAILED"), recorder.failed(strategy, QUOTE, RunOutcome.API_ERROR, "down"));
    }

    @Test
    void aFailureOnAStrategyTheCustomerSwitchedOffMeanwhileChangesNothingAndSaysSo() {
        when(mapper.recordFailure(anyLong(), anyString())).thenReturn(Optional.empty());

        assertTrue(recorder.failed(strategy, QUOTE, RunOutcome.REJECTED, "refused").isEmpty());
    }

    @Test
    void aSwitchOffBeforeTheOrderLeftIsOnTheTrailAndMovesNothing() {
        recorder.disabledBeforeSend(strategy, QUOTE);

        assertEquals(RunOutcome.DISABLED, written().outcome());
        verify(mapper, never()).recordFailure(anyLong(), anyString());
        verify(mapper, never()).recordSuccess(anyLong(), anyLong());
    }

    @Test
    void aStaleQuoteIsRecordedAtMostOnceInAWhile() {
        recorder.stale(strategy, QUOTE);

        ArgumentCaptor<NewRun> run = ArgumentCaptor.forClass(NewRun.class);
        verify(mapper).insertStaleRunOnce(run.capture());
        assertEquals(RunOutcome.STALE, run.getValue().outcome());
        verify(mapper, never()).insertRun(any());
    }
}
