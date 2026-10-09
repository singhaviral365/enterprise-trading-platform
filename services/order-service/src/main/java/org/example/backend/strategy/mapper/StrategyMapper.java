package org.example.backend.strategy.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.strategy.model.NewStrategy;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyRun;

import java.util.List;
import java.util.Optional;

/**
 * The order-service's side of the {@code strategy} table: what a customer can do (create, list, switch off and on,
 * cancel) and what the announcer and the order gate read. The executor-service moves a strategy through its runs with its
 * own mapper on the same table; the lifecycle trigger in strategy-schema.sql is what keeps the two from disagreeing.
 */
@Mapper
public interface StrategyMapper {

    /** Serialises changes to one account's strategies for the rest of the transaction, so the cap cannot be raced past. */
    int lockAccountForStrategies(@Param("accountId") long accountId);

    /**
     * Inserts the strategy only if the account holds fewer than {@code limit} open ones (ACTIVE, EXECUTING or DISABLED).
     * The count and the insert are one statement.
     *
     * @return the new strategy id, or empty if the account is at its limit
     */
    Optional<Long> insertIfUnderLimit(@Param("s") NewStrategy strategy, @Param("limit") int limit);

    Optional<Strategy> selectById(@Param("strategyId") long strategyId);

    /**
     * The strategy, with a shared row lock held until the transaction ends. A switch-off or cancel needs the exclusive
     * lock, so it waits for an order being placed under this lock, or has already committed and is seen here.
     */
    Optional<Strategy> selectByIdForShare(@Param("strategyId") long strategyId);

    List<Strategy> selectByAccountId(@Param("accountId") long accountId);

    /** @return 1 if the strategy was ACTIVE or EXECUTING and is now DISABLED, 0 otherwise */
    int disable(@Param("strategyId") long strategyId, @Param("reason") String reason);

    /**
     * Switches a DISABLED strategy back on, un-armed, with its failure count cleared, so it needs a fresh crossing.
     *
     * @return 1 if it was DISABLED and its window is still open, 0 otherwise
     */
    int enable(@Param("strategyId") long strategyId);

    /** @return 1 if the strategy was ACTIVE, EXECUTING or DISABLED and is now CANCELLED, 0 otherwise */
    int cancel(@Param("strategyId") long strategyId, @Param("reason") String reason);

    List<StrategyRun> selectRuns(@Param("strategyId") long strategyId, @Param("limit") int limit);

    /** FAILED and EXPIRED strategies the customer has not been told about yet. */
    List<Strategy> selectNeedingAnnouncement(@Param("limit") int limit);

    int markAnnounced(@Param("strategyId") long strategyId);

    /** Records how the run's order ended. A run that is already settled, or not yet recorded, is left alone. */
    int settleRun(
            @Param("strategyId") long strategyId,
            @Param("runNumber") int runNumber,
            @Param("settledStatus") String settledStatus);
}
