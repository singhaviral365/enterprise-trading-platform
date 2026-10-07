package org.example.trade_executor.strategy;

import org.example.trade_executor.strategy.config.StrategySettings;
import org.example.trade_executor.strategy.mapper.StrategyMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Housekeeping that does not depend on a quote arriving. It expires strategies whose window closed (a strategy on a quiet
 * instrument would otherwise stay ACTIVE long after its end date), and gives back claims that were never finished because the
 * worker died mid-run. A recovered strategy runs again on its next trigger with the same order key, so an order that did get
 * placed before the crash is recognised and linked instead of being placed twice.
 */
@Component
public class StrategySweeper {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategySweeper.class);

    private final StrategyMapper strategies;
    private final StrategySettings settings;

    public StrategySweeper(StrategyMapper strategies, StrategySettings settings) {
        this.strategies = strategies;
        this.settings = settings;
    }

    @Scheduled(fixedDelayString = "${strategy.sweeper.interval-millis:15000}")
    public void sweep() {
        try {
            int recovered = strategies.recoverStuck(settings.claimTimeout().toSeconds());
            if (recovered > 0) {
                LOGGER.warn("{} strategy claim(s) were never finished and were given back", recovered);
            }
            int expired = strategies.expireOverdue();
            if (expired > 0) {
                LOGGER.info("{} strategy(ies) expired", expired);
            }
        } catch (RuntimeException ex) {
            // The table may not exist yet on a database that was not upgraded: log it, never stop the scheduler.
            LOGGER.warn("The strategy sweep failed: {}", ex.getClass().getSimpleName());
        }
    }
}
