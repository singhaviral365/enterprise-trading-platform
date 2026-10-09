package org.example.backend.events;

import org.example.backend.enums.OrderSide;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OrderPlacedAfterCommitListenerTest {

    @Mock
    private OrderEventProducer orderEventProducer;

    @Test
    void eventIsPublishedOnlyAfterCommitWhenTransactionIsActive() {
        OrderPlacedAfterCommitListener listener =
                new OrderPlacedAfterCommitListener(orderEventProducer);

        OrderPlacedEvent event = new OrderPlacedEvent(
                9001L,
                1,
                "ACME",
                OrderSide.BUY,
                100L,
                OffsetDateTime.parse("2026-09-16T09:00:00Z"));

        TransactionSynchronizationManager.initSynchronization();
        try {
            listener.onOrderPlaced(event);

            verify(orderEventProducer, never()).publishOrderPlaced(event);

            List<TransactionSynchronization> synchronizations =
                    TransactionSynchronizationManager.getSynchronizations();
            assertEquals(1, synchronizations.size());

            synchronizations.forEach(TransactionSynchronization::afterCommit);

            verify(orderEventProducer).publishOrderPlaced(event);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}

