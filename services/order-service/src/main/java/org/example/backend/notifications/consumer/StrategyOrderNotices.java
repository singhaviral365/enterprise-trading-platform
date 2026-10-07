package org.example.backend.notifications.consumer;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * A port the trade-events consumer asks, for each order outcome, whether the order came from an automated strategy. If it
 * did, the strategy module supplies the words (and records how the order ended on the strategy's trail); the consumer then
 * files the notification under the strategy category instead of the ordinary one.
 *
 * <p>It is an interface, with the strategy module on the other side, so the notifications module knows nothing about
 * strategies: an order nobody claims is an ordinary order and gets the ordinary notification.
 */
public interface StrategyOrderNotices {

    /**
     * @param orderId   the order that was filled, rejected or cancelled
     * @param eventType {@code ORDER_FILLED}, {@code ORDER_REJECTED} or {@code ORDER_CANCELLED}
     * @return the notice if a strategy placed the order, empty for an ordinary order
     */
    Optional<Notice> noticeFor(long orderId, String eventType, BigDecimal executionPrice, String reason);

    /** The words of a strategy notice. */
    record Notice(String title, String message) {
    }
}
