package org.example.trade_executor.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.kafka.KafkaException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class TradeEventProducer {

    private static final Logger LOGGER = LoggerFactory.getLogger(TradeEventProducer.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String tradesTopic;
    private final String source;
    private final int schemaVersion;

    public TradeEventProducer(
            @Qualifier("deadLetterKafkaTemplate") KafkaTemplate<String, String> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${trading.kafka.trades-topic:trades}") String tradesTopic,
            @Value("${trading.kafka.execution-source:trade-executor}") String source,
            @Value("${trading.kafka.schema-version:1}") int schemaVersion) {

        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.tradesTopic = tradesTopic;
        this.source = source;
        this.schemaVersion = schemaVersion;
    }

    public void publish(OrderResolvedEvent event) {
        KafkaEventEnvelope<OrderResolvedMessage> envelope = new KafkaEventEnvelope<>(
                UUID.randomUUID().toString(),
                event.eventType(),
                OffsetDateTime.now(ZoneOffset.UTC).toString(),
                source,
                schemaVersion,
                OrderResolvedMessage.from(event));

        final String payload;
        try {
            payload = objectMapper.writeValueAsString(envelope);
        } catch (JsonProcessingException ex) {
            throw new KafkaException("Failed to serialize order resolution event", ex);
        }

        try {
            SendResult<String, String> result = kafkaTemplate.send(
                tradesTopic,
                String.valueOf(event.accountId()),
                payload).get(5, TimeUnit.SECONDS);

            LOGGER.info(
                "Published {} event for order {} to {}-{}@{}",
                event.eventType(),
                event.orderId(),
                result.getRecordMetadata().topic(),
                result.getRecordMetadata().partition(),
                result.getRecordMetadata().offset());
        } catch (Exception ex) {
            LOGGER.error(
                "Failed to publish {} event for order {} to topic {}",
                event.eventType(),
                event.orderId(),
                tradesTopic,
                ex);
            throw new KafkaException("Failed to publish order resolution event", ex);
        }
    }
}

