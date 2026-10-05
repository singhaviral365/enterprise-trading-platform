package org.example.backend.events;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.example.backend.enums.OrderSide;

import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public record OrderPlacedMessage(
        long orderId,
        int accountId,
        String symbol,
        OrderSide side,
        long quantity,
        @JsonAlias("occurredAt")
        OffsetDateTime receivedAt) {
}

