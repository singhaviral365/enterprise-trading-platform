package org.example.trade_executor.marketdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.dto.kafka.KafkaEventEnvelope;
import org.example.trade_executor.client.LiveQuote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.KafkaException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class MarketDataEventProducer {

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketDataEventProducer.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String marketDataTopic;
    private final String source;
    private final int schemaVersion;

    public MarketDataEventProducer(
            @Qualifier("deadLetterKafkaTemplate") KafkaTemplate<String, String> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${trading.kafka.market-data-topic:market-data}") String marketDataTopic,
            @Value("${trading.kafka.execution-source:trade-executor}") String source,
            @Value("${trading.kafka.schema-version:1}") int schemaVersion) {

        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.marketDataTopic = marketDataTopic;
        this.source = source;
        this.schemaVersion = schemaVersion;
    }

    public void publish(LiveQuote quote, OffsetDateTime quotedAt) {
        KafkaEventEnvelope<MarketDataQuoteMessage> envelope = new KafkaEventEnvelope<>(
                UUID.randomUUID().toString(),
                "QUOTE",
                OffsetDateTime.now(ZoneOffset.UTC).toString(),
                source,
                schemaVersion,
                MarketDataQuoteMessage.from(quote, quotedAt));

        final String payload;
        try {
            payload = objectMapper.writeValueAsString(envelope);
        } catch (JsonProcessingException ex) {
            throw new KafkaException("Failed to serialize market data quote event", ex);
        }

        try {
            SendResult<String, String> result = kafkaTemplate.send(
                    marketDataTopic,
                    quote.symbol(),
                    payload).get(5, TimeUnit.SECONDS);

            if (result != null && result.getRecordMetadata() != null) {
                LOGGER.info(
                        "Published QUOTE event for symbol {} to {}-{}@{}",
                        quote.symbol(),
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                LOGGER.info("Published QUOTE event for symbol {} to topic {}", quote.symbol(), marketDataTopic);
            }
        } catch (Exception ex) {
            LOGGER.error(
                    "Failed to publish QUOTE event for symbol {} to topic {}",
                    quote.symbol(),
                    marketDataTopic,
                    ex);
            throw new KafkaException("Failed to publish market data quote event", ex);
        }
    }
}