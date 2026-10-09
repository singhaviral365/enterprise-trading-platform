package org.example.backend.strategy.service;

import org.example.backend.dto.PlaceOrderRequest;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.strategy.exceptions.StrategyOrderRejectedException;
import org.example.backend.strategy.mapper.StrategyMapper;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.model.StrategyStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * The check an order placed with a strategy executor's token must pass before the order route does anything else. The
 * token says <em>which strategy</em> it was minted for; this checks that strategy is, right now, allowed to place
 * exactly this order. It is what turns a stolen executor token from "can trade for this customer for a minute" into "can
 * try to place the one order the strategy would place anyway, and only while the strategy holds its claim".
 *
 * <p>It must be called inside the transaction that then places the order. It reads the strategy with a shared row lock, which
 * a switch-off or cancel (needing the exclusive lock) cannot get until that transaction ends. So a customer switching a
 * strategy off either commits before this reads it, and the order is refused, or waits for the order being placed. There is
 * no window between this check and the order being written in which a switch-off is lost.
 */
@Component
public class StrategyOrderGuard {

    private final StrategyMapper strategies;
    private final Clock clock;

    @Autowired
    public StrategyOrderGuard(StrategyMapper strategies) {
        this(strategies, Clock.systemUTC());
    }

    StrategyOrderGuard(StrategyMapper strategies, Clock clock) {
        this.strategies = strategies;
        this.clock = clock;
    }

    /** @throws StrategyOrderRejectedException when the order is not the one the strategy may place now */
    public Strategy requireMayPlace(long strategyId, PlaceOrderRequest order) {
        Strategy strategy = strategies.selectByIdForShare(strategyId)
                .orElseThrow(() -> new StrategyOrderRejectedException("no such strategy " + strategyId));

        if (strategy.status() != StrategyStatus.EXECUTING) {
            throw new StrategyOrderRejectedException("strategy " + strategyId + " is " + strategy.status() + ", not claimed");
        }
        if (strategy.validUntil() != null && !strategy.validUntil().isAfter(OffsetDateTime.now(clock))) {
            throw new StrategyOrderRejectedException("strategy " + strategyId + " window has closed");
        }
        if (strategy.executions() >= strategy.maxExecutions()) {
            throw new StrategyOrderRejectedException("strategy " + strategyId + " has used all its executions");
        }
        if (order.accountId() == null || order.accountId() != strategy.accountId()) {
            throw new StrategyOrderRejectedException("order account differs from strategy " + strategyId);
        }
        if (order.symbol() == null || !order.symbol().trim().equalsIgnoreCase(strategy.tickerSymbol())) {
            throw new StrategyOrderRejectedException("order instrument differs from strategy " + strategyId);
        }
        if (order.side() != strategy.side()) {
            throw new StrategyOrderRejectedException("order side differs from strategy " + strategyId);
        }
        if (order.orderPricingType() != OrderPricingType.MARKET) {
            throw new StrategyOrderRejectedException("strategy orders are market orders");
        }
        if (order.quantity() == null || order.quantity() != strategy.quantity()) {
            throw new StrategyOrderRejectedException("order quantity differs from strategy " + strategyId);
        }
        if (!strategy.nextOrderKey().equals(order.idempotencyKey())) {
            throw new StrategyOrderRejectedException("order key is not the one strategy " + strategyId + " expects");
        }
        return strategy;
    }
}
