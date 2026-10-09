package org.example.backend.watchlist.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.watchlist.alert.PriceAlertEvaluator;
import org.example.backend.watchlist.exceptions.PoisonQuoteMessageException;
import org.example.backend.watchlist.price.LatestQuoteStore;
import org.example.backend.watchlist.price.Quote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

/**
 * Reads the {@code market-data} topic in this module's own consumer group and keeps the latest
 * quote per symbol, in memory, for the watchlist screens. Reads no other topic.
 *
 * <p>The executor-service's poller is what puts watched instruments on that topic (it reads the
 * watchlist symbols and prices them); this consumer only reads what arrives.
 *
 * <p>Runs with nobody logged in: it holds no token and touches no customer data, only the
 * in-memory quote store, so there is no authorisation decision to make on this path.
 */
@Component
public class MarketDataQuoteConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketDataQuoteConsumer.class);
    private static final String QUOTE_EVENT = "QUOTE";

    private final LatestQuoteStore store;
    private final PriceAlertEvaluator alerts;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public MarketDataQuoteConsumer(LatestQuoteStore store, PriceAlertEvaluator alerts) {
        this.store = store;
        this.alerts = alerts;
    }

    /** Prices only, no alerts: what the quote store alone needs. */
    public MarketDataQuoteConsumer(LatestQuoteStore store) {
        this(store, null);
    }

    @KafkaListener(
            topics = "${watchlist.kafka.market-data-topic:market-data}",
            groupId = "${watchlist.kafka.consumer-group:watchlist-prices}",
            containerFactory = "watchlistKafkaListenerContainerFactory",
            autoStartup = "${watchlist.kafka.consumer.enabled:true}")
    public void onMessage(String payload) {
        handle(payload);
    }

    /**
     * @return the quote that was stored, or null if the message was ignored or not newer than what is held
     * @throws PoisonQuoteMessageException if the message is malformed and can never be processed
     */
    public Quote handle(String payload) {
        JsonNode envelope = parse(payload);

        String eventType = text(envelope, "eventType");
        if (!QUOTE_EVENT.equals(eventType)) {
            LOGGER.debug("Ignoring market-data event of type {}", eventType);
            return null;
        }

        JsonNode body = envelope.get("payload");
        if (body == null || !body.isObject()) {
            throw new PoisonQuoteMessageException("QUOTE event has no payload");
        }

        String symbol = text(body, "symbol");
        if (symbol == null || symbol.isBlank()) {
            throw new PoisonQuoteMessageException("QUOTE event has no symbol");
        }

        Quote quote = new Quote(symbol.trim(), price(body), quotedAt(body, envelope));
        if (!store.offer(quote)) {
            return null;
        }
        evaluateAlerts(quote);
        return quote;
    }

    /**
     * Asks whether this quote crosses anyone's alert. Only a quote that moved the store forward gets here, so a replayed
     * or out-of-order quote cannot fire anything. A failure is logged and swallowed: the price is already applied, and
     * retrying the message would find it no newer and skip this step, so letting it propagate would only dead-letter a
     * good quote. The alert stays armed and is judged against the next quote.
     */
    private void evaluateAlerts(Quote quote) {
        if (alerts == null) {
            return;
        }
        try {
            alerts.evaluate(quote);
        } catch (RuntimeException ex) {
            LOGGER.error("Could not evaluate price alerts for {}; they stay armed", quote.symbol(), ex);
        }
    }

    private JsonNode parse(String payload) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payload);
        } catch (Exception ex) {
            throw new PoisonQuoteMessageException("market-data message is not valid JSON", ex);
        }
        if (node == null || !node.isObject()) {
            throw new PoisonQuoteMessageException("market-data message is not a JSON object");
        }
        return node;
    }

    private static BigDecimal price(JsonNode body) {
        JsonNode node = body.get("price");
        if (node == null || !node.isNumber()) {
            throw new PoisonQuoteMessageException("QUOTE event has no numeric price");
        }
        BigDecimal price = node.decimalValue();
        if (price.signum() <= 0) {
            throw new PoisonQuoteMessageException("QUOTE price must be positive");
        }
        return price;
    }

    private static OffsetDateTime quotedAt(JsonNode body, JsonNode envelope) {
        String raw = text(body, "quotedAt");
        if (raw == null) {
            raw = text(envelope, "eventTime");
        }
        if (raw == null) {
            throw new PoisonQuoteMessageException("QUOTE event has no quotedAt");
        }
        try {
            return OffsetDateTime.parse(raw);
        } catch (DateTimeParseException ex) {
            throw new PoisonQuoteMessageException("QUOTE quotedAt is not a valid timestamp", ex);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
