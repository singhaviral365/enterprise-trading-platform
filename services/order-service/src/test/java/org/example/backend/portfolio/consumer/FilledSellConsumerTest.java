package org.example.backend.portfolio.consumer;

import org.example.backend.portfolio.exceptions.PoisonPortfolioEventException;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FilledSellConsumerTest {

    private RealisedPnlReconciler reconciler;
    private FilledSellConsumer consumer;

    @BeforeEach
    void setUp() {
        reconciler = mock(RealisedPnlReconciler.class);
        consumer = new FilledSellConsumer(reconciler);
    }

    private static String event(String type, String side) {
        return """
                {"eventId":"e-1","eventType":"%s","payload":{"orderId":42,"accountId":7,"symbol":"AAPL","side":"%s",
                 "quantity":5,"executionPrice":130.00}}""".formatted(type, side);
    }

    @Test
    void aFilledSaleBooksTheAccountsRealisedProfitAndLoss() {
        when(reconciler.reconcileAccount(7)).thenReturn(1);

        assertEquals(1, consumer.handle(event("ORDER_FILLED", "SELL")));

        verify(reconciler).reconcileAccount(7);
    }

    @Test
    void aReplayedEventBooksNothingTwice() {
        // The first delivery books the sale; the replay finds nothing left to book. The reconciler is the one place
        // that decides, and it books on the order id, so a second delivery is a no-op.
        when(reconciler.reconcileAccount(7)).thenReturn(1, 0, 0);

        assertEquals(1, consumer.handle(event("ORDER_FILLED", "SELL")));
        assertEquals(0, consumer.handle(event("ORDER_FILLED", "SELL")));
        assertEquals(0, consumer.handle(event("ORDER_FILLED", "SELL")));
    }

    @Test
    void aBuyAFillOfAnotherKindOrARejectionRealisesNothing() {
        assertEquals(-1, consumer.handle(event("ORDER_FILLED", "BUY")));
        assertEquals(-1, consumer.handle(event("ORDER_REJECTED", "SELL")));
        assertEquals(-1, consumer.handle(event("ORDER_CANCELLED", "SELL")));

        verify(reconciler, never()).reconcileAccount(anyLong());
    }

    @Test
    void aMessageThatCanNeverBeProcessedIsPoison() {
        assertThrows(PoisonPortfolioEventException.class, () -> consumer.handle("not json"));
        assertThrows(PoisonPortfolioEventException.class, () -> consumer.handle("[1,2]"));
        assertThrows(PoisonPortfolioEventException.class,
                () -> consumer.handle("{\"eventType\":\"ORDER_FILLED\"}"));
        assertThrows(PoisonPortfolioEventException.class,
                () -> consumer.handle("{\"eventType\":\"ORDER_FILLED\",\"payload\":{\"side\":\"SELL\",\"orderId\":1}}"));
        assertThrows(PoisonPortfolioEventException.class,
                () -> consumer.handle("{\"eventType\":\"ORDER_FILLED\",\"payload\":{\"side\":\"SELL\",\"accountId\":1}}"));
    }
}
