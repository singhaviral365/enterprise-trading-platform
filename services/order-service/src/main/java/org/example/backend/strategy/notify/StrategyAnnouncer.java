package org.example.backend.strategy.notify;

import org.example.backend.notifications.consumer.StrategyOrderNotices.Notice;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Tells customers about the two things that happen to a strategy without an order: the platform stopped it after repeated
 * failures, or its window closed. (The orders it places are announced from the trade events instead.)
 *
 * <p>The executor-service moves a strategy to FAILED or EXPIRED but cannot reach the notifications module, which lives
 * here. So this looks for finished strategies not yet announced, hands each to the notification gateway under a key that
 * names the strategy and the status, and marks it announced. Handing one over twice is a no-op in the gateway, so a crash
 * between the two steps only means the mark is made on the next pass.
 */
@Component
public class StrategyAnnouncer {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyAnnouncer.class);
    private static final int BATCH = 50;

    private final StrategyMapper strategies;
    private final NotificationGateway gateway;

    public StrategyAnnouncer(StrategyMapper strategies, NotificationGateway gateway) {
        this.strategies = strategies;
        this.gateway = gateway;
    }

    @Scheduled(fixedDelayString = "${strategy.announce.interval-millis:30000}")
    public void announce() {
        List<Strategy> pending;
        try {
            pending = strategies.selectNeedingAnnouncement(BATCH);
        } catch (RuntimeException ex) {
            LOGGER.warn("Could not look for strategies to announce: {}", ex.getClass().getSimpleName());
            return;
        }

        for (Strategy strategy : pending) {
            try {
                Notice notice = strategy.status() == StrategyStatus.FAILED
                        ? StrategyMessages.forStopped(strategy)
                        : StrategyMessages.forExpired(strategy);
                gateway.deliver(new NotificationRequest(
                        strategy.accountId(),
                        NotificationCategory.STRATEGY_EXECUTION,
                        "strategy:" + strategy.strategyId() + ":" + strategy.status(),
                        notice.title(),
                        notice.message()));
                strategies.markAnnounced(strategy.strategyId());
            } catch (RuntimeException ex) {
                // Left unmarked, so the next pass tries again.
                LOGGER.warn("Could not announce strategy {} ({}): {}",
                        strategy.strategyId(), strategy.status(), ex.getClass().getSimpleName());
            }
        }
    }
}
