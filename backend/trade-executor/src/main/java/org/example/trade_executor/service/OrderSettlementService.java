package org.example.trade_executor.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.example.trade_executor.events.OrderResolvedEvent;
import org.example.trade_executor.executor.ExecutionOutcome;
import org.example.trade_executor.executor.ExecutionRejectReason;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Optional;

@Service
public class OrderSettlementService {

    private final AccountMapper accountMapper;
    private final HoldingMapper holdingMapper;
    private final InstrumentMapper instrumentMapper;
    private final OrderMapper orderMapper;

    public OrderSettlementService(
            AccountMapper accountMapper,
            HoldingMapper holdingMapper,
            InstrumentMapper instrumentMapper,
            OrderMapper orderMapper) {

        this.accountMapper = accountMapper;
        this.holdingMapper = holdingMapper;
        this.instrumentMapper = instrumentMapper;
        this.orderMapper = orderMapper;
    }

    @Transactional
    public Optional<OrderResolvedEvent> settle(long orderId, ExecutionOutcome marketOutcome) {
        Order order = orderMapper.selectOrderById(orderId).orElse(null);
        if (order == null) {
            return Optional.empty();
        }

        Instrument instrument = instrumentMapper
                .selectInstrumentById(order.getInstrumentId())
                .orElse(null);

        SettlementDecision settlementDecision = determineSettlementDecision(
                order,
                instrument,
                marketOutcome);

        OffsetDateTime transactionDate = OffsetDateTime.now();

        if (settlementDecision.outcome().isRejected()) {
            int updatedRows = orderMapper.rejectOrderIfNew(orderId, transactionDate);
            if (updatedRows == 0) {
                return Optional.empty();
            }

            return Optional.of(orderResolvedEvent(order, instrument, settlementDecision.outcome(), transactionDate));
        }

        BigDecimal executionPrice = settlementDecision.executionPrice();
        int updatedRows = orderMapper.fillOrderIfNew(orderId, executionPrice, transactionDate);
        if (updatedRows == 0) {
            return Optional.empty();
        }

        applyFilledSettlement(order, settlementDecision.account(), settlementDecision.holding(), executionPrice);
        return Optional.of(orderResolvedEvent(order, instrument, ExecutionOutcome.filled(executionPrice), transactionDate));
    }

    private SettlementDecision determineSettlementDecision(
            Order order,
            Instrument instrument,
            ExecutionOutcome marketOutcome) {

        if (instrument == null || !instrument.isTradable()) {
            return new SettlementDecision(
                    ExecutionOutcome.rejected(ExecutionRejectReason.INSTRUMENT_NOT_TRADABLE),
                    null,
                    null,
                    null);
        }

        if (marketOutcome.isRejected()) {
            return new SettlementDecision(marketOutcome, null, null, null);
        }

        Account account = accountMapper
                .selectAccountById(order.getAccountId())
                .orElse(null);

        if (account == null || account.getAccountStatus() != AccountStatus.ACTIVE) {
            return new SettlementDecision(
                    ExecutionOutcome.rejected(ExecutionRejectReason.ACCOUNT_NOT_ACTIVE),
                    account,
                    null,
                    null);
        }

        BigDecimal storedExecutionPrice = normaliseExecutionPrice(marketOutcome.executionPrice());

        if (order.getOrderSide() == OrderSide.BUY) {
            BigDecimal orderValue = calculateOrderValue(storedExecutionPrice, order.getQuantity());
            if (!account.canAfford(orderValue)) {
                return new SettlementDecision(
                        ExecutionOutcome.rejected(ExecutionRejectReason.INSUFFICIENT_FUNDS),
                        account,
                        null,
                        storedExecutionPrice);
            }

            return new SettlementDecision(
                    ExecutionOutcome.filled(storedExecutionPrice),
                    account,
                    null,
                    storedExecutionPrice);
        }

        Holding holding = holdingMapper
                .selectHoldingByAccountAndInstrument(order.getAccountId(), order.getInstrumentId())
                .orElse(null);

        if (holding == null || holding.getQuantity() < order.getQuantity()) {
            return new SettlementDecision(
                    ExecutionOutcome.rejected(ExecutionRejectReason.INSUFFICIENT_HOLDINGS),
                    account,
                    holding,
                    storedExecutionPrice);
        }

        return new SettlementDecision(
                ExecutionOutcome.filled(storedExecutionPrice),
                account,
                holding,
                storedExecutionPrice);
    }

    private void applyFilledSettlement(
            Order order,
            Account account,
            Holding holding,
            BigDecimal executionPrice) {

        BigDecimal orderValue = calculateOrderValue(executionPrice, order.getQuantity());

        if (order.getOrderSide() == OrderSide.BUY) {
            account.debit(orderValue);
        } else {
            account.credit(orderValue);
        }

        int updatedRows = accountMapper.updateAccountBalanceWithVersion(
                order.getAccountId(),
                account.getBalance(),
                account.getVersion());

        if (updatedRows == 0) {
            throw new OptimisticLockException();
        }

        if (order.getOrderSide() == OrderSide.BUY) {
            upsertBuyHolding(order, executionPrice);
            return;
        }

        long remainingQuantity = holding.getQuantity() - order.getQuantity();
        int holdingUpdatedRows = holdingMapper.updateHoldingQuantity(holding.getHoldingId(), remainingQuantity);
        if (holdingUpdatedRows == 0) {
            throw new IllegalStateException("Holding update affected no rows");
        }
    }

    private void upsertBuyHolding(Order order, BigDecimal executionPrice) {
        Holding existingHolding = holdingMapper
                .selectHoldingByAccountAndInstrument(order.getAccountId(), order.getInstrumentId())
                .orElse(null);

        if (existingHolding == null) {
            Holding newHolding = new Holding(
                    holdingMapper.nextHoldingId(),
                    order.getQuantity(),
                    executionPrice,
                    order.getAccountId(),
                    order.getInstrumentId());
            int insertedRows = holdingMapper.insertHolding(newHolding);
            if (insertedRows == 0) {
                throw new IllegalStateException("Holding insert affected no rows");
            }
            return;
        }

        long newQuantity = existingHolding.getQuantity() + order.getQuantity();
        BigDecimal currentValue = existingHolding.getPurchasePrice()
                .multiply(BigDecimal.valueOf(existingHolding.getQuantity()));
        BigDecimal incomingValue = executionPrice.multiply(BigDecimal.valueOf(order.getQuantity()));
        BigDecimal newAveragePrice = currentValue
                .add(incomingValue)
                .divide(BigDecimal.valueOf(newQuantity), 2, RoundingMode.HALF_UP);

        int updatedRows = holdingMapper.updateHoldingQuantityAndPrice(
                existingHolding.getHoldingId(),
                newQuantity,
                newAveragePrice);
        if (updatedRows == 0) {
            throw new IllegalStateException("Holding update affected no rows");
        }
    }

    private OrderResolvedEvent orderResolvedEvent(
            Order order,
            Instrument instrument,
            ExecutionOutcome outcome,
            OffsetDateTime transactionDate) {
        return new OrderResolvedEvent(
                outcome.isFilled() ? "ORDER_FILLED" : "ORDER_REJECTED",
                order.getOrderId(),
                order.getAccountId(),
                instrument == null ? String.valueOf(order.getInstrumentId()) : instrument.getInstrumentTicker(),
                order.getOrderSide(),
                order.getQuantity(),
                outcome.executionPrice(),
                outcome.rejectReason(),
                transactionDate);
    }

    private static BigDecimal calculateOrderValue(BigDecimal price, long quantity) {
        return price
                .multiply(BigDecimal.valueOf(quantity))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal normaliseExecutionPrice(BigDecimal executionPrice) {
        return executionPrice.setScale(2, RoundingMode.HALF_UP);
    }

    private record SettlementDecision(
            ExecutionOutcome outcome,
            Account account,
            Holding holding,
            BigDecimal executionPrice) {
    }
}

