package org.example.backend.strategy.notify;

import org.example.backend.mapper.OrderMapper;
import org.example.backend.notifications.consumer.StrategyOrderNotices;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tells the notifications module whether an order was placed by a strategy, and if so what to say. An order is traced back to
 * its strategy by its idempotency key, {@code strat-{strategyId}-{run}}, which is written in the same statement that creates
 * the order. Looking it up there, instead of in a table the executor fills in afterwards, means a fill that is announced
 * before the executor has recorded its run is still recognised.
 *
 * <p>It also records how the order ended on the strategy's trail, which a customer reads on the strategy's page.
 */
@Component
public class StrategyNoticeProvider implements StrategyOrderNotices {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyNoticeProvider.class);
    private static final Pattern KEY = Pattern.compile("^" + Strategy.ORDER_KEY_PREFIX + "(\\d{1,18})-(\\d{1,9})$");

    private final OrderMapper orders;
    private final StrategyMapper strategies;

    public StrategyNoticeProvider(OrderMapper orders, StrategyMapper strategies) {
        this.orders = orders;
        this.strategies = strategies;
    }

    @Override
    public Optional<Notice> noticeFor(long orderId, String eventType, BigDecimal executionPrice, String reason) {
        Optional<org.example.backend.entities.Order> order = orders.selectOrderById(orderId);
        if (order.isEmpty()) {
            return Optional.empty();
        }

        Matcher key = KEY.matcher(order.get().getIdempotencyKey());
        if (!key.matches()) {
            return Optional.empty();
        }
        long strategyId = Long.parseLong(key.group(1));
        int runNumber = Integer.parseInt(key.group(2));

        Optional<Strategy> strategy = strategies.selectById(strategyId);
        if (strategy.isEmpty() || strategy.get().accountId() != order.get().getAccountId()) {
            // A key that only looks like a strategy's, on an order that is not that strategy's account: an ordinary order.
            LOGGER.warn("Order {} has a strategy-style key that matches no strategy of its account", orderId);
            return Optional.empty();
        }

        strategies.settleRun(strategyId, runNumber, settledStatus(eventType));
        return Optional.of(StrategyMessages.forOrderOutcome(strategy.get(), eventType, executionPrice, reason));
    }

    private static String settledStatus(String eventType) {
        return switch (eventType) {
            case StrategyMessages.FILLED -> "FILLED";
            case StrategyMessages.REJECTED -> "REJECTED";
            default -> "CANCELLED";
        };
    }
}
