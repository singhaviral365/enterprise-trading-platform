package org.example.backend.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class OrderPlacedAfterCommitListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(OrderPlacedAfterCommitListener.class);

    private final OrderEventProducer orderEventProducer;

    public OrderPlacedAfterCommitListener(OrderEventProducer orderEventProducer) {
        this.orderEventProducer = orderEventProducer;
    }

    public void onOrderPlaced(OrderPlacedEvent event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publishRecoverably(event);
                }
            });
            return;
        }

        publishRecoverably(event);
    }

    private void publishRecoverably(OrderPlacedEvent event) {
        try {
            orderEventProducer.publishOrderPlaced(event);
        } catch (RuntimeException ex) {
            LOGGER.error(
                    "Order {} committed but ORDER_PLACED publish failed. Replay from orders table is required.",
                    event.orderId(),
                    ex);
        }
    }
}

