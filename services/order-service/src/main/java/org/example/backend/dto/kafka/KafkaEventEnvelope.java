package org.example.backend.dto.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Base envelope for all Kafka messages.
 * 
 * Per contracts/kafka-topics.md, every message carries a five-field envelope
 * plus a payload. The envelope is identical on all topics so one deserializer
 * and one dead-letter handler cover the platform.
 * 
 * Adding optional fields is not a breaking change and does not increment schemaVersion.
 * Removing, renaming, or changing field types is breaking.
 * Consumers must ignore fields they do not recognize.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class KafkaEventEnvelope<T> {
    /**
     * Unique per message, UUID format.
     * Idempotency key for consumers: processing the same eventId twice must be safe.
     */
    private String eventId;
    
    /**
     * Enum discriminating the payload type.
     * Examples: ORDER_PLACED, ORDER_FILLED, QUOTE
     */
    private String eventType;
    
    /**
     * RFC 3339 date-time in UTC when the producer created the event.
     * Not the consumption time; consumed time is independent.
     */
    private String eventTime;
    
    /**
     * Producing component: trade-api, trade-executor, market-poller.
     * Distinguishes the origin of the message.
     */
    private String source;
    
    /**
     * Starts at 1, increments on breaking changes only.
     * Adding optional fields does not increment this.
     */
    private Integer schemaVersion;
    
    /**
     * Topic-specific and event-type-specific payload.
     */
    private T payload;
}
