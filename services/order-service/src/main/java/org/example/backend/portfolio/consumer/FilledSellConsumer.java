package org.example.backend.portfolio.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.portfolio.exceptions.PoisonPortfolioEventException;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Reads {@code trade-events} in this module's own consumer group and books the realised profit and loss of every filled
 * sale. Everything else on the topic (buys, rejections, cancellations) is ignored: only a sale realises anything.
 *
 * <p><b>Idempotent.</b> Kafka delivers at least once. Booking is keyed by the sale's order id, so a replayed
 * {@code ORDER_FILLED} finds nothing left to book and writes nothing: the realised total cannot be double-counted.
 *
 * <p><b>The offset is committed once the sale is durably booked</b> (or already was), which is when this method returns.
 * The average cost at the sale is not in the event; it is replayed from the account's earlier fills, which is
 * deterministic, so a late event gives the same answer as a prompt one. If the order cannot be read yet, nothing is
 * booked here and the reconciler books it on the next read: a missed sale is delayed, never lost or wrong.
 */
@Component
public class FilledSellConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(FilledSellConsumer.class);

    static final String ORDER_FILLED = "ORDER_FILLED";
    static final String SELL = "SELL";

    private final RealisedPnlReconciler reconciler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FilledSellConsumer(RealisedPnlReconciler reconciler) {
        this.reconciler = reconciler;
    }

    @KafkaListener(
            topics = "${portfolio.kafka.trade-events-topic:trade-events}",
            groupId = "${portfolio.kafka.consumer-group:portfolio-pnl}",
            containerFactory = "portfolioKafkaListenerContainerFactory",
            autoStartup = "${portfolio.kafka.consumer.enabled:true}")
    public void onMessage(String payload) {
        handle(payload);
    }

    /**
     * @return how many sales were booked, or -1 when the event is not a filled sale
     * @throws PoisonPortfolioEventException if the message is malformed and can never be processed
     */
    public int handle(String payload) {
        JsonNode envelope = parse(payload);

        String eventType = text(envelope, "eventType");
        if (!ORDER_FILLED.equals(eventType)) {
            return -1;
        }
        JsonNode body = envelope.get("payload");
        if (body == null || !body.isObject()) {
            throw new PoisonPortfolioEventException("ORDER_FILLED event has no payload");
        }
        if (!SELL.equals(text(body, "side"))) {
            return -1;
        }

        long accountId = positiveLong(body, "accountId");
        positiveLong(body, "orderId");

        int booked = reconciler.reconcileAccount(accountId);
        LOGGER.debug("Filled sale on account {}: {} entr(ies) booked", accountId, booked);
        return booked;
    }

    private JsonNode parse(String payload) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payload);
        } catch (Exception ex) {
            throw new PoisonPortfolioEventException("trade-events message is not valid JSON", ex);
        }
        if (node == null || !node.isObject()) {
            throw new PoisonPortfolioEventException("trade-events message is not a JSON object");
        }
        return node;
    }

    private static long positiveLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong() || value.asLong() < 1) {
            throw new PoisonPortfolioEventException("Event has no valid " + field);
        }
        return value.asLong();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
