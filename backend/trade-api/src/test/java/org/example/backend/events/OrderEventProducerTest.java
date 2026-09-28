package org.example.backend.events;

import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.example.backend.enums.OrderSide;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OrderEventProducerTest {

    @Mock
    private KafkaTemplate<String, KafkaEventEnvelope<OrderPlacedMessage>> kafkaTemplate;

    @Test
    void publishesOrderPlacedToOrdersTopicKeyedByAccount() {
        OrderEventProducer producer = new OrderEventProducer(kafkaTemplate, "orders", "trade-api", 1);

        OrderPlacedEvent event = new OrderPlacedEvent(
                9001L,
                1,
                "ACME",
                OrderSide.BUY,
                100L,
                OffsetDateTime.parse("2026-09-16T09:00:00Z"));

        producer.publishOrderPlaced(event);

        ArgumentCaptor<KafkaEventEnvelope<OrderPlacedMessage>> envelopeCaptor =
                ArgumentCaptor.forClass(KafkaEventEnvelope.class);

        verify(kafkaTemplate).send(
                eq("orders"),
                eq("1"),
                envelopeCaptor.capture());

        KafkaEventEnvelope<OrderPlacedMessage> envelope = envelopeCaptor.getValue();
        assertNotNull(envelope.getEventId());
        assertNotNull(envelope.getEventTime());
        assertEquals("ORDER_PLACED", envelope.getEventType());
        assertEquals("trade-api", envelope.getSource());
        assertEquals(1, envelope.getSchemaVersion());

        OrderPlacedMessage payload = envelope.getPayload();
        assertEquals(9001L, payload.orderId());
        assertEquals(1, payload.accountId());
    }
}


