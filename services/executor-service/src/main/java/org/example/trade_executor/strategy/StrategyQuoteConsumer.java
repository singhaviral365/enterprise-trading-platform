package org.example.trade_executor.strategy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.trade_executor.strategy.model.StrategyQuote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Locale;

/**
 * Reads the {@code market-data} topic in a consumer group of its own and hands each QUOTE to the {@link StrategyWorker}. It
 * reads no other topic and publishes to none: a strategy's order goes through the order route, not through Kafka.
 *
 * <p>The offset is committed only after the worker has finished with the quote, which includes writing down what it did. A
 * crash in between delivers the quote again, and that is safe: a claim cannot be taken twice, and an order placed twice
 * carries the same key and is recognised.
 *
 * <p>The group starts at the end of the topic the first time, so a worker that has just been deployed never acts on a
 * backlog of old prices; after that it resumes where it stopped.
 */
@Component
public class StrategyQuoteConsumer {

    static final String QUOTE_EVENT = "QUOTE";

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyQuoteConsumer.class);

    private final ObjectMapper objectMapper;
    private final StrategyWorker worker;

    public StrategyQuoteConsumer(ObjectMapper objectMapper, StrategyWorker worker) {
        this.objectMapper = objectMapper;
        this.worker = worker;
    }

    @KafkaListener(
            topics = "${trading.kafka.market-data-topic:market-data}",
            groupId = "${strategy.kafka.consumer-group:strategy-worker}",
            containerFactory = "strategyKafkaListenerContainerFactory",
            autoStartup = "${strategy.kafka.consumer.enabled:true}")
    public void onMessage(String message, Acknowledgment acknowledgment) {
        StrategyQuote quote = parse(message);
        if (quote != null) {
            worker.onQuote(quote);
        }
        acknowledgment.acknowledge();
    }

    /** @return the quote, or null for an event that is not a QUOTE */
    StrategyQuote parse(String message) {
        final JsonNode envelope;
        try {
            envelope = objectMapper.readTree(message);
        } catch (IOException ex) {
            throw new PoisonStrategyQuoteException("market-data message is not valid JSON", ex);
        }
        if (envelope == null || !envelope.isObject()) {
            throw new PoisonStrategyQuoteException("market-data message is not a JSON object");
        }

        JsonNode type = envelope.get("eventType");
        if (type == null || !QUOTE_EVENT.equals(type.asText())) {
            LOGGER.debug("Ignoring market-data event of type {}", type);
            return null;
        }

        JsonNode payload = envelope.get("payload");
        if (payload == null || !payload.isObject()) {
            throw new PoisonStrategyQuoteException("QUOTE event has no payload");
        }

        JsonNode symbol = payload.get("symbol");
        if (symbol == null || !symbol.isTextual() || symbol.asText().isBlank()) {
            throw new PoisonStrategyQuoteException("QUOTE event has no symbol");
        }

        JsonNode price = payload.get("price");
        if (price == null || !price.isNumber() || price.decimalValue().signum() <= 0) {
            throw new PoisonStrategyQuoteException("QUOTE event has no positive price");
        }

        return new StrategyQuote(
                symbol.asText().trim().toUpperCase(Locale.ROOT),
                price.decimalValue(),
                quotedAt(payload, envelope));
    }

    private static OffsetDateTime quotedAt(JsonNode payload, JsonNode envelope) {
        JsonNode raw = payload.get("quotedAt");
        if (raw == null || !raw.isTextual()) {
            raw = envelope.get("eventTime");
        }
        if (raw == null || !raw.isTextual()) {
            throw new PoisonStrategyQuoteException("QUOTE event has no quotedAt");
        }
        try {
            return OffsetDateTime.parse(raw.asText());
        } catch (DateTimeParseException ex) {
            throw new PoisonStrategyQuoteException("QUOTE event has an unreadable quotedAt", ex);
        }
    }
}
