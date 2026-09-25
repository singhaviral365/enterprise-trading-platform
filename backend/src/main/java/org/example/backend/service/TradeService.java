package org.example.backend.service;

import org.example.backend.dto.AccountResponse;
import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.CreateAccountRequest;
import org.example.backend.dto.CreateAccountResult;
import org.example.backend.dto.LinkAccountStatusResponse;
import org.example.backend.dto.OrderHistoryEntry;
import org.example.backend.dto.OrderResponse;
import org.example.backend.dto.PositionResponse;
import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.entities.Order;
import org.example.backend.events.OrderPlacedAfterCommitListener;
import org.example.backend.events.OrderPlacedEvent;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderPricingType;
import org.example.backend.enums.OrderSide;
import org.example.backend.enums.OrderStatus;
import org.example.backend.exceptions.AccountNotActiveException;
import org.example.backend.exceptions.AccountLinkConflictException;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.DuplicateOrderException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.exceptions.InsufficientFundsException;
import org.example.backend.exceptions.InsufficientHoldingsException;
import org.example.backend.exceptions.OptimisticLockException;
import org.example.backend.exceptions.OrderNotFoundException;
import org.example.backend.exceptions.OrderNotCancellableException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.mapper.OrderMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class TradeService {

        private static final BigDecimal MIN_OPENING_BALANCE = new BigDecimal("20000.0000");

        private static final BigDecimal MARKET_PERSISTED_PRICE = new BigDecimal("0.0001");

    private final AccountMapper accountMapper;
    private final HoldingMapper holdingMapper;
    private final InstrumentMapper instrumentMapper;
    private final OrderMapper orderMapper;
    private final OrderPlacedAfterCommitListener orderPlacedAfterCommitListener;

    public TradeService(
            AccountMapper accountMapper,
            HoldingMapper holdingMapper,
            InstrumentMapper instrumentMapper,
            OrderMapper orderMapper,
            OrderPlacedAfterCommitListener orderPlacedAfterCommitListener) {

        this.accountMapper = accountMapper;
        this.holdingMapper = holdingMapper;
        this.instrumentMapper = instrumentMapper;
        this.orderMapper = orderMapper;
        this.orderPlacedAfterCommitListener = orderPlacedAfterCommitListener;
    }

    // =========================================================
    // STORY 5 - PLACE ORDER
    // =========================================================

    @Transactional
    public OrderResponse placeOrder(
            long accountId,
            String symbol,
            OrderSide side,
            OrderPricingType orderPricingType,
            long quantity,
            BigDecimal price,
            String idempotencyKey) {

        requireActiveAccount(accountId);
        Instrument instrument = requireTradableInstrument(symbol);
        ensureIdempotencyKeyUnused(idempotencyKey);

        BigDecimal persistedPrice = normalizePersistedPrice(orderPricingType, price);

        Order order = createAndPersistNewOrder(
                accountId,
                instrument,
                side,
                orderPricingType,
                quantity,
                persistedPrice,
                idempotencyKey);

        orderPlacedAfterCommitListener.onOrderPlaced(
                new OrderPlacedEvent(
                        order.getOrderId(),
                        order.getAccountId(),
                        symbol,
                        order.getOrderSide(),
                        order.getQuantity(),
                        order.getReceivedAt()));

        return new OrderResponse(
                String.valueOf(order.getOrderId()),
                order.getOrderStatus(),
                "Order placed successfully",
                symbol,
                order.getOrderSide(),
                order.getPricingType(),
                (int) order.getQuantity(),
                                orderPricingType == OrderPricingType.MARKET
                                                ? null
                                                : order.getPrice());
    }

        private static BigDecimal normalizePersistedPrice(
                        OrderPricingType orderPricingType,
                        BigDecimal requestedPrice) {

                if (orderPricingType == OrderPricingType.MARKET && requestedPrice == null) {
                        return MARKET_PERSISTED_PRICE;
                }

                return requestedPrice;
        }

    private Account requireActiveAccount(long accountId) {
        Account account = accountMapper
                .selectAccountById((int) accountId)
                .orElseThrow(() ->
                        new AccountNotFoundException(accountId));

        if (account.getAccountStatus() != AccountStatus.ACTIVE) {
            throw new AccountNotActiveException(
                    accountId,
                    account.getAccountStatus());
        }

        return account;
    }

    private Instrument requireTradableInstrument(String symbol) {
        Instrument instrument = instrumentMapper
                .selectInstrumentByTicker(symbol)
                .orElseThrow(() ->
                        new InstrumentNotFoundException(symbol));

        if (!instrument.isTradable()) {
            throw new InstrumentNotFoundException(symbol);
        }

        return instrument;
    }

    private void ensureIdempotencyKeyUnused(String idempotencyKey) {
        if (orderMapper
                .selectOrderByIdempotencyKey(idempotencyKey)
                .isPresent()) {

            throw new DuplicateOrderException(idempotencyKey);
        }
    }

    private static BigDecimal calculateOrderValue(
            BigDecimal price,
            long quantity) {

        return price
                .multiply(BigDecimal.valueOf(quantity))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private Holding validateOrderAndLoadSellHolding(
            long accountId,
            String symbol,
            OrderSide side,
            long quantity,
            Account account,
            Instrument instrument,
            BigDecimal orderValue) {

        if (side == OrderSide.BUY) {
            assertSufficientFunds(accountId, account, orderValue);
            return null;
        }

        return requireSufficientHolding(
                accountId,
                symbol,
                quantity,
                instrument.getInstrumentId());
    }

    private void assertSufficientFunds(
            long accountId,
            Account account,
            BigDecimal orderValue) {

        if (!account.canAfford(orderValue)) {
            throw new InsufficientFundsException(
                    accountId,
                    orderValue,
                    account.getBalance());
        }
    }

    private Holding requireSufficientHolding(
            long accountId,
            String symbol,
            long quantity,
            int instrumentId) {

        Holding holding = holdingMapper
                .selectHoldingByAccountAndInstrument(
                        (int) accountId,
                        instrumentId)
                .orElse(null);

        long availableQuantity =
                holding == null
                        ? 0
                        : holding.getQuantity();

        if (availableQuantity < quantity) {
            throw new InsufficientHoldingsException(
                    accountId,
                    symbol,
                    quantity,
                    availableQuantity);
        }

        return holding;
    }

    private static void applyCashChange(
            Account account,
            OrderSide side,
            BigDecimal orderValue) {

        if (side == OrderSide.BUY) {
            account.debit(orderValue);
        } else {
            account.credit(orderValue);
        }
    }

    private void updateAccountBalanceOrThrow(
            long accountId,
            Account account) {

        int affectedRows = accountMapper.updateAccountBalanceWithVersion(
                (int) accountId,
                account.getBalance(),
                account.getVersion());

        if (affectedRows == 0) {
            throw new OptimisticLockException();
        }
    }

    private void persistHoldingChange(
            long accountId,
            OrderSide side,
            long quantity,
            BigDecimal price,
            Instrument instrument,
            Holding sellHolding) {

        if (side == OrderSide.BUY) {
            upsertBuyHolding(accountId, quantity, price, instrument);
            return;
        }

        long remainingQuantity = sellHolding.getQuantity() - quantity;
        holdingMapper.updateHoldingQuantity(
                sellHolding.getHoldingId(),
                remainingQuantity);
    }

    private void upsertBuyHolding(
            long accountId,
            long quantity,
            BigDecimal price,
            Instrument instrument) {

        Holding existingHolding = holdingMapper
                .selectHoldingByAccountAndInstrument(
                        (int) accountId,
                        instrument.getInstrumentId())
                .orElse(null);

        if (existingHolding == null) {
            insertNewHolding(accountId, quantity, price, instrument);
            return;
        }

        long oldQuantity = existingHolding.getQuantity();
        long newQuantity = oldQuantity + quantity;

        BigDecimal oldValue = existingHolding.getPurchasePrice()
                .multiply(BigDecimal.valueOf(oldQuantity));

        BigDecimal newValue = price
                .multiply(BigDecimal.valueOf(quantity));

        BigDecimal averagePrice = oldValue
                .add(newValue)
                .divide(
                        BigDecimal.valueOf(newQuantity),
                        2,
                        RoundingMode.HALF_UP);

        holdingMapper.updateHoldingQuantityAndPrice(
                existingHolding.getHoldingId(),
                newQuantity,
                averagePrice);
    }

    private void insertNewHolding(
            long accountId,
            long quantity,
            BigDecimal price,
            Instrument instrument) {

        long holdingId = holdingMapper.nextHoldingId();

        Holding newHolding = new Holding(
                holdingId,
                quantity,
                price,
                (int) accountId,
                instrument.getInstrumentId());

        holdingMapper.insertHolding(newHolding);
    }

    // -----------------------------------------------------
    // Create order
    // -----------------------------------------------------
    private Order createAndPersistNewOrder(
            long accountId,
            Instrument instrument,
            OrderSide side,
            OrderPricingType orderPricingType,
            long quantity,
            BigDecimal price,
            String idempotencyKey) {

        long orderId = orderMapper.nextOrderId();
        OffsetDateTime receivedAt = OffsetDateTime.now();

        Order order = new Order(
                orderId,
                idempotencyKey,
                OrderStatus.NEW,
                receivedAt,
                side,
                orderPricingType,
                price,
                quantity,
                null,
                (int) accountId,
                instrument.getInstrumentId());

        orderMapper.insertOrder(order);
        return order;
    }

    // =========================================================
    // STORY 5 - CANCEL ORDER
    // =========================================================

    /*
     * NOTE:
     * The current Order entity/database uses long order_id,
     * while the API contract specifies UUID for cancellation.
     *
     * This method therefore cannot be made contract-correct until
     * the order ID representation is aligned.
     *
     * Do NOT fake a UUID -> long conversion.
     */
    @Transactional
    public OrderResponse cancelOrder(
            long orderId,
            long accountId) {

        Order order = orderMapper
                .selectOrderById(orderId)
                .orElseThrow(() ->
                        new OrderNotFoundException(
                                syntheticOrderUuid(orderId)));

        if (order.getAccountId() != accountId) {
            throw new AccountNotActiveException(
                    accountId,
                    AccountStatus.ACTIVE);
        }

        int affectedRows =
                orderMapper.cancelOrder(
                        orderId,
                        accountId);

        if (affectedRows == 0) {
            throw new OrderNotCancellableException(
                    syntheticOrderUuid(orderId));
        }

        return new OrderResponse(
                String.valueOf(orderId),
                OrderStatus.CANCELLED,
                "Order cancelled successfully",
                null,
                order.getOrderSide(),
                order.getPricingType(),
                (int) order.getQuantity(),
                order.getPrice());
    }

    private static UUID syntheticOrderUuid(long orderId) {
        return UUID.nameUUIDFromBytes(
                String.valueOf(orderId)
                        .getBytes());
    }

    // =========================================================
    // STORY 6 - ACCOUNT
    // =========================================================

    public AccountResponse getAccount(long accountId) {

        AccountResponse account =
                accountMapper.selectAccountResponseById(accountId);

        if (account == null) {
            throw new AccountNotFoundException(accountId);
        }

        return account;
    }

    // =========================================================
    // STORY 6 - BALANCE
    // =========================================================

    public BalanceResponse getBalance(long accountId) {

        BalanceResponse balance =
                accountMapper.selectBalanceResponseByAccountId(
                        accountId);

        if (balance == null) {
            throw new AccountNotFoundException(accountId);
        }

        return balance;
    }

    // =========================================================
    // STORY 6 - POSITIONS
    // =========================================================

    public List<PositionResponse> getPositions(
            long accountId) {

        if (accountMapper.selectAccountById((int) accountId)
                .isEmpty()) {

            throw new AccountNotFoundException(accountId);
        }

        return holdingMapper
                .selectPositionResponsesByAccountId(accountId);
    }

    // =========================================================
    // STORY 6 - ORDER HISTORY
    // =========================================================

    public List<OrderHistoryEntry> getOrders(
            long accountId,
            OrderStatus status,
            OffsetDateTime from,
            OffsetDateTime to) {

        if (accountMapper.selectAccountById((int) accountId)
                .isEmpty()) {

            throw new AccountNotFoundException(accountId);
        }

        return orderMapper.selectOrderHistoryByAccountId(
                accountId,
                status,
                from,
                to);
    }

    public void assertUserCanAccessAccount(
            long userId,
            long accountId) {
                int accountIdInt = Math.toIntExact(accountId);
                if (!accountMapper.accountExists(accountIdInt)) {
                        throw new AccountNotFoundException(accountId);
                }

                Integer linkedUserId = accountMapper.selectAccountLinkedUserId(accountIdInt);
                if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
                        throw new AccountLinkConflictException("Account is not linked to authenticated user");
        }
    }

        public boolean isAccountLinkedToUser(
                        long userId,
                        long accountId) {
                int accountIdInt = Math.toIntExact(accountId);
                int userIdInt = Math.toIntExact(userId);

                return accountMapper.isAccountLinkedToUser(accountIdInt, userIdInt);
        }

        public LinkAccountStatusResponse getAccountLinkStatusForUser(long userId) {
                int userIdInt = Math.toIntExact(userId);
                var accounts = accountMapper.selectAccountsByUserId(userIdInt);

                if (accounts.isEmpty()) {
                        return new LinkAccountStatusResponse(
                                        false,
                                        "No linked account yet",
                                        null);
                }

                String accountNumber = accounts.get(0).getAccountNumber();
                return new LinkAccountStatusResponse(
                                true,
                                "Linked account found",
                                accountNumber);
        }

    @Transactional
    public OrderResponse cancelOrderForUser(
            long orderId,
            long userId) {

        Order order = orderMapper
                .selectOrderById(orderId)
                .orElseThrow(() ->
                        new OrderNotFoundException(
                                syntheticOrderUuid(orderId)));

        assertUserCanAccessAccount(userId, order.getAccountId());

        return cancelOrder(orderId, order.getAccountId());
    }

    @Transactional
        public CreateAccountResult createAccountForAuth(
                        long userId,
                        CreateAccountRequest request) {
                int userIdInt = Math.toIntExact(userId);

                if (accountMapper.countAccountsByUserId(userIdInt) > 0) {
                        throw new AccountLinkConflictException("User already has an account");
                }

        int accountId = Math.toIntExact(accountMapper.nextAccountId());
        String accountNumber = formatAccountNumber(accountId);
        BigDecimal openingBalance = resolveOpeningBalance(request.balance());

        Account account = new Account(
                accountId,
                accountNumber,
                LocalDate.now(),
                openingBalance,
                openingBalance,
                AccountStatus.ACTIVE,
                "USD",
                1L,
                null,
                null,
                userIdInt);

        accountMapper.insertAccount(account);

        return new CreateAccountResult(
                accountId,
                accountNumber,
                AccountStatus.ACTIVE.name(),
                "Account created successfully");
    }

        private BigDecimal resolveOpeningBalance(BigDecimal requestedBalance) {
                if (requestedBalance == null) {
                        return MIN_OPENING_BALANCE;
                }

                BigDecimal normalized = requestedBalance.setScale(4);
                if (normalized.compareTo(MIN_OPENING_BALANCE) < 0) {
                        throw new IllegalArgumentException("Opening balance must be at least 20000");
                }

                return normalized;
        }

    private static String formatAccountNumber(int accountId) {
                return "ACC" + String.format("%09d", accountId);
    }
}