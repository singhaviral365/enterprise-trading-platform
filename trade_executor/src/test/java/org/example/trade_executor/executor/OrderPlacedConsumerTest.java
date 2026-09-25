package org.example.trade_executor.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.trade_executor.service.TradeExecutorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OrderPlacedConsumerTest {

    @Mock
    private TradeExecutorService tradeExecutorService;

    @Mock
    private Acknowledgment acknowledgment;

    private OrderPlacedConsumer consumer;

    @BeforeEach
    void setUp() {
      consumer = new OrderPlacedConsumer(
          new ObjectMapper().findAndRegisterModules(),
          tradeExecutorService,
          "orders",
          "trade-executor");
    }

    @Test
    void malformedMessageIsPoison() {
        assertThrows(PoisonOrderMessageException.class, () -> consumer.consume("{", acknowledgment));
        verify(tradeExecutorService, never()).execute(org.mockito.ArgumentMatchers.any());
        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    void missingOrderIdIsPoison() {
        String message = """
                {
                  \"eventId\": \"event-1\",
                  \"eventType\": \"ORDER_PLACED\",
                  \"eventTime\": \"2026-09-17T10:00:00Z\",
                  \"source\": \"trade-api\",
                  \"schemaVersion\": 1,
                  \"payload\": {
                    \"accountId\": 1,
                    \"symbol\": \"ACME\",
                    \"side\": \"BUY\",
                    \"quantity\": 10,
                    \"receivedAt\": \"2026-09-17T10:00:00Z\"
                  }
                }
                """;

        assertThrows(PoisonOrderMessageException.class, () -> consumer.consume(message, acknowledgment));
        verify(tradeExecutorService, never()).execute(org.mockito.ArgumentMatchers.any());
        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    void unexpectedEventTypeIsPoison() {
        String message = """
                {
                  \"eventId\": \"event-1\",
                  \"eventType\": \"ORDER_CANCELLED\",
                  \"eventTime\": \"2026-09-17T10:00:00Z\",
                  \"source\": \"trade-api\",
                  \"schemaVersion\": 1,
                  \"payload\": {
                    \"orderId\": 1,
                    \"accountId\": 1,
                    \"symbol\": \"ACME\",
                    \"side\": \"BUY\",
                    \"quantity\": 10,
                    \"receivedAt\": \"2026-09-17T10:00:00Z\"
                  }
                }
                """;

        assertThrows(PoisonOrderMessageException.class, () -> consumer.consume(message, acknowledgment));
        verify(tradeExecutorService, never()).execute(org.mockito.ArgumentMatchers.any());
        verify(acknowledgment, never()).acknowledge();
    }
}

