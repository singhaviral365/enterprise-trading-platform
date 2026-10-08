package org.example.trade_executor.strategy.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.trade_executor.strategy.model.ExistingOrder;
import org.example.trade_executor.strategy.model.NewRun;
import org.example.trade_executor.strategy.model.RunnableStrategy;

import java.util.List;
import java.util.Optional;

/**
 * The executor-service's side of the {@code strategy} table, which the order-service owns. Every statement that moves a
 * strategy checks the status it expects in its WHERE clause, so the answer to "did I win?" is the number of rows changed,
 * and a switch-off by the customer is never overwritten. The lifecycle trigger in strategy-schema.sql is the backstop.
 *
 * <p>This mapper only reads {@code orders} (to link a duplicate to the order an earlier attempt placed). Placing an order is
 * never done here: it goes through {@code POST /api/v1/orders}.
 */
@Mapper
public interface StrategyMapper {

    /** ACTIVE strategies on one instrument: the per-quote lookup. Straight from the table, never cached. */
    List<RunnableStrategy> selectActiveForTicker(@Param("ticker") String ticker);

    /** Arms a strategy on a quote seen on the safe side of its trigger. @return 1 if it was ACTIVE and un-armed */
    int arm(@Param("strategyId") long strategyId);

    /**
     * Claims an ACTIVE, armed strategy for one run, if its window is open and it has runs left. This is the only gate:
     * a strategy that was switched off, cancelled, expired or already claimed is not ACTIVE and is not claimed.
     *
     * @return 1 if this worker now holds the claim, 0 otherwise
     */
    int claim(@Param("strategyId") long strategyId);

    /**
     * The last look before the order is sent: still claimed, and the window still open. Refreshes the claim time.
     *
     * @return 1 if the strategy is still EXECUTING, 0 if the customer switched it off in the meantime
     */
    int confirmClaim(@Param("strategyId") long strategyId);

    /**
     * Ends a claim that did not place an order and counts the failure. The strategy goes back to ACTIVE, or to FAILED when
     * this was its last allowed failure in a row. A strategy the customer switched off meanwhile is left as they set it.
     *
     * @return the strategy's new status, or empty if it was no longer EXECUTING
     */
    Optional<String> recordFailure(@Param("strategyId") long strategyId, @Param("reason") String reason);

    /**
     * Counts a placed order: one more run done, failures cleared, the order remembered. The strategy goes to EXECUTED when it
     * has no runs left, otherwise back to ACTIVE and un-armed (it needs a fresh crossing). A strategy the customer switched
     * off or cancelled meanwhile keeps that status; only its counters move.
     */
    int recordSuccess(@Param("strategyId") long strategyId, @Param("orderId") long orderId);

    int insertRun(@Param("run") NewRun run);

    /** A STALE row, at most one per strategy in five minutes, so a backlog of old quotes cannot flood the trail. */
    int insertStaleRunOnce(@Param("run") NewRun run);

    int settleRun(
            @Param("strategyId") long strategyId,
            @Param("runNumber") int runNumber,
            @Param("settledStatus") String settledStatus);

    Optional<ExistingOrder> selectOrderByKey(@Param("idempotencyKey") String idempotencyKey);

    /** Moves ACTIVE or DISABLED strategies whose window has closed to EXPIRED. @return how many */
    int expireOverdue();

    /** Gives back claims that were never finished (a crash mid-run) so the strategy can run again. @return how many */
    int recoverStuck(@Param("seconds") long seconds);
}
