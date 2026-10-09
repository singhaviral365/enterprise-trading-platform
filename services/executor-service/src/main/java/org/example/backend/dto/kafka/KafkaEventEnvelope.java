package org.example.backend.dto.kafka;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record KafkaEventEnvelope<T>(
        String eventId,
        String eventType,
    @JsonAlias("occurredAt")
    String eventTime,
        String source,
        int schemaVersion,
        T payload) {

    public T getPayload() {
        return payload;
    }
}


