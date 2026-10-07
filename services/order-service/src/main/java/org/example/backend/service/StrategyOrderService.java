package org.example.backend.service;

import org.example.backend.dto.OrderResponse;
import org.example.backend.dto.PlaceOrderRequest;
import org.example.backend.strategy.model.Strategy;
import org.example.backend.strategy.service.StrategyOrderGuard;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Places the order of a request that carries a strategy executor's token. It is the same {@link TradeService#placeOrder}
 * every customer order goes through, so the account, instrument, idempotency and every other rule apply unchanged; what is
 * added in front of it is {@link StrategyOrderGuard}, in the same transaction.
 *
 * <p>It lives outside the strategy package on purpose: the strategy module itself never reaches order placement.
 */
@Service
public class StrategyOrderService {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyOrderService.class);

    private final StrategyOrderGuard guard;
    private final TradeService tradeService;

    public StrategyOrderService(StrategyOrderGuard guard, TradeService tradeService) {
        this.guard = guard;
        this.tradeService = tradeService;
    }

    @Transactional
    public OrderResponse place(long userId, long strategyId, PlaceOrderRequest request) {
        // The token's user is the strategy's owner: the same ownership check as for the customer's own order.
        tradeService.assertUserCanAccessAccount(userId, request.accountId());

        Strategy strategy = guard.requireMayPlace(strategyId, request);

        LOGGER.info("Placing the order of strategy {} (run {}) for account {}: {} {} {}",
                strategy.strategyId(), strategy.executions() + 1, strategy.accountId(),
                request.side(), request.quantity(), request.symbol());

        return tradeService.placeOrder(
                request.accountId(),
                request.symbol(),
                request.side(),
                request.orderPricingType(),
                request.quantity(),
                request.price(),
                request.idempotencyKey());
    }
}
