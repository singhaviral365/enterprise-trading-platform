package org.example.backend.notifications.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.notifications.exceptions.PoisonTradeEventException;
import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.preferences.model.NotificationCategory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Reads {@code trade-events} in this module's own consumer group and turns each order outcome (filled, rejected,
 * cancelled) into a notification. Reads no other topic.
 *
 * <p><b>Offset versus delivery.</b> The listener returns once {@link NotificationGateway#deliver} has durably recorded
 * the notification; the container then commits the offset. It does not wait for an email provider, so a slow mail
 * server cannot stall the partition (and every account sharing it). What reached the customer is tracked separately,
 * per channel, in {@code notification_delivery}.
 *
 * <p><b>Replays.</b> Kafka delivers at least once. The notification is keyed by the event's {@code eventId}, so a
 * second delivery of the same event is a no-op in the gateway.
 *
 * <p>The consumer holds no token and acts for no logged-in user: it reacts to an event the executor published, and
 * the account comes from that event. Customers read what it records only through the owner-checked inbox routes.
 */
@Component
public class TradeEventsConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(TradeEventsConsumer.class);

    private final NotificationGateway gateway;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TradeEventsConsumer(NotificationGateway gateway) {
        this.gateway = gateway;
    }

    @KafkaListener(
            topics = "${notifications.kafka.trade-events-topic:trade-events}",
            groupId = "${notifications.kafka.consumer-group:customer-notifications}",
            containerFactory = "notificationsKafkaListenerContainerFactory",
            autoStartup = "${notifications.kafka.consumer.enabled:true}")
    public void onMessage(String payload) {
        handle(payload);
    }

    /**
     * @return what the gateway did, or null if the event is not an order outcome this module notifies about
     * @throws PoisonTradeEventException if the message is malformed and can never be processed
     */
    public GatewayResult handle(String payload) {
        JsonNode envelope = parse(payload);

        String eventType = text(envelope, "eventType");
        if (eventType == null || !OrderOutcomeMessages.handles(eventType)) {
            LOGGER.debug("Ignoring trade-events event of type {}", eventType);
            return null;
        }

        String eventId = text(envelope, "eventId");
        if (eventId == null || eventId.isBlank()) {
            throw new PoisonTradeEventException(eventType + " event has no eventId");
        }
        JsonNode body = envelope.get("payload");
        if (body == null || !body.isObject()) {
            throw new PoisonTradeEventException(eventType + " event has no payload");
        }

        long accountId = positiveLong(body, "accountId");
        long quantity = positiveLong(body, "quantity");
        String symbol = text(body, "symbol");
        if (symbol == null || symbol.isBlank()) {
            throw new PoisonTradeEventException(eventType + " event has no symbol");
        }

        BigDecimal price = optionalNumber(body, "executionPrice");
        try {
            return gateway.deliver(new NotificationRequest(
                    accountId,
                    NotificationCategory.ORDER_STATUS,
                    eventId.trim(),
                    OrderOutcomeMessages.title(eventType),
                    OrderOutcomeMessages.message(
                            eventType, text(body, "side"), quantity, symbol.trim(), price, text(body, "reason"))));
        } catch (IllegalArgumentException ex) {
            // The request failed its own validation (an over-long field): the message can never succeed.
            throw new PoisonTradeEventException(eventType + " event cannot be turned into a notification", ex);
        }
    }

    private JsonNode parse(String payload) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payload);
        } catch (Exception ex) {
            throw new PoisonTradeEventException("trade-events message is not valid JSON", ex);
        }
        if (node == null || !node.isObject()) {
            throw new PoisonTradeEventException("trade-events message is not a JSON object");
        }
        return node;
    }

    private static long positiveLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong() || value.asLong() < 1) {
            throw new PoisonTradeEventException("Event has no valid " + field);
        }
        return value.asLong();
    }

    private static BigDecimal optionalNumber(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || !value.isNumber() ? null : value.decimalValue();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
