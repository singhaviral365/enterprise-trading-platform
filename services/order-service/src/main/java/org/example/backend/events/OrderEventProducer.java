package org.example.backend.events;

import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Component
public class OrderEventProducer {

    private final KafkaTemplate<String, KafkaEventEnvelope<OrderPlacedMessage>> kafkaTemplate;
    private final String ordersTopic;
    private final String source;
    private final int schemaVersion;

    public OrderEventProducer(
            KafkaTemplate<String, KafkaEventEnvelope<OrderPlacedMessage>> kafkaTemplate,
            @Value("${trading.kafka.orders-topic:orders}") String ordersTopic,
            @Value("${trading.kafka.source:trade-api}") String source,
            @Value("${trading.kafka.schema-version:1}") int schemaVersion) {

        this.kafkaTemplate = kafkaTemplate;
        this.ordersTopic = ordersTopic;
        this.source = source;
        this.schemaVersion = schemaVersion;
    }

    public void publishOrderPlaced(OrderPlacedEvent event) {
        KafkaEventEnvelope<OrderPlacedMessage> envelope = new KafkaEventEnvelope<>(
                UUID.randomUUID().toString(),
                "ORDER_PLACED",
                OffsetDateTime.now(ZoneOffset.UTC).toString(),
                source,
                schemaVersion,
                OrderPlacedMessage.from(event));

        kafkaTemplate.send(
                ordersTopic,
                String.valueOf(event.accountId()),
                envelope);
    }
}

