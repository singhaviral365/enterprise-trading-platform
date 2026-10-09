package org.example.trade_executor.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class OrderResolvedAfterCommitListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(OrderResolvedAfterCommitListener.class);

    private final TradeEventProducer tradeEventProducer;

    public OrderResolvedAfterCommitListener(TradeEventProducer tradeEventProducer) {
        this.tradeEventProducer = tradeEventProducer;
    }

    public void onOrderResolved(OrderResolvedEvent event) {
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

    private void publishRecoverably(OrderResolvedEvent event) {
        try {
            tradeEventProducer.publish(event);
        } catch (RuntimeException ex) {
            LOGGER.error(
                    "Order {} committed as {} but terminal event publish failed.",
                    event.orderId(),
                    event.eventType(),
                    ex);
        }
    }
}

