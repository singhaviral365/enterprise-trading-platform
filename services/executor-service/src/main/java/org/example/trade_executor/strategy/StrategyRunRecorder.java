package org.example.trade_executor.strategy;

import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.NewRun;
import org.example.trade_executor.strategy.model.RunOutcome;
import org.example.trade_executor.strategy.model.RunnableStrategy;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Writes down what came of an attempt, in one transaction each: the row on the strategy's trail and the move of the strategy
 * itself, so the two can never disagree. It is a bean of its own because a transaction needs a call across beans.
 */
@Service
public class StrategyRunRecorder {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyRunRecorder.class);

    private final StrategyMapper mapper;

    public StrategyRunRecorder(StrategyMapper mapper) {
        this.mapper = mapper;
    }

    /** The order exists (placed now, or by an earlier attempt of the same run): count the run and link the order. */
    @Transactional
    public void ordered(RunnableStrategy strategy, StrategyQuote quote, long orderId, boolean duplicate) {
        try {
            mapper.insertRun(run(strategy, quote, duplicate ? RunOutcome.DUPLICATE : RunOutcome.ORDERED, orderId,
                    duplicate ? "The order had already been placed by an earlier attempt" : "Order placed"));
        } catch (DuplicateKeyException ex) {
            // The same run's order was already written down by another delivery of the same trigger: nothing more to add.
            LOGGER.info("Run {} of strategy {} was already recorded", strategy.runNumber(), strategy.strategyId());
        }
        mapper.recordSuccess(strategy.strategyId(), orderId);

        // The order may have been settled before this row existed (the fill is announced the moment it happens), in which
        // case the notice that would have settled the run found nothing to settle. Settle it from the order itself.
        Optional<ExistingOrder> order = mapper.selectOrderByKey(strategy.orderKey());
        if (order.isPresent() && order.get().isSettled()) {
            mapper.settleRun(strategy.strategyId(), strategy.runNumber(), order.get().status());
        }
    }

    /**
     * An attempt that placed nothing and counts against the strategy: a limit held it back, the route refused the order, or
     * the route could not be reached. The strategy goes back to ACTIVE, or to FAILED at its limit.
     *
     * @return the strategy's new status, or empty if the customer had already switched it off
     */
    @Transactional
    public Optional<String> failed(RunnableStrategy strategy, StrategyQuote quote, RunOutcome outcome, String detail) {
        mapper.insertRun(run(strategy, quote, outcome, null, detail));
        Optional<String> status = mapper.recordFailure(strategy.strategyId(), detail);
        if (status.isPresent() && "FAILED".equals(status.get())) {
            LOGGER.warn("Strategy {} stopped after {} failures in a row", strategy.strategyId(), strategy.maxFailures());
        }
        return status;
    }

    /** The customer switched the strategy off between the claim and the order, so no order was sent. Nothing else moves. */
    @Transactional
    public void disabledBeforeSend(RunnableStrategy strategy, StrategyQuote quote) {
        mapper.insertRun(run(strategy, quote, RunOutcome.DISABLED, null, "Switched off before the order was sent"));
    }

    /** The trigger was met but the quote was too old to act on. Recorded at most once in a while per strategy. */
    @Transactional
    public void stale(RunnableStrategy strategy, StrategyQuote quote) {
        mapper.insertStaleRunOnce(run(strategy, quote, RunOutcome.STALE, null, "The quote was too old to act on"));
    }

    private static NewRun run(
            RunnableStrategy strategy, StrategyQuote quote, RunOutcome outcome, Long orderId, String detail) {
        return new NewRun(strategy.strategyId(), strategy.runNumber(), quote.price(), quote.quotedAt(), outcome, orderId, detail);
    }
}
