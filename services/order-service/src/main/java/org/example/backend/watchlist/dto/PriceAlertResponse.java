package org.example.backend.watchlist.dto;

import org.example.backend.watchlist.model.AlertDelivery;
import org.example.backend.watchlist.model.AlertDirection;
import org.example.backend.watchlist.model.AlertStatus;
import org.example.backend.watchlist.model.PriceAlert;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** An entry's alert as the customer sees it, including the state that says whether it has fired. */
public record PriceAlertResponse(
        AlertDirection direction,
        BigDecimal targetPrice,
        AlertStatus status,
        OffsetDateTime setAt,
        OffsetDateTime triggeredAt,
        BigDecimal triggerPrice,
        AlertDelivery delivery) {

    public static PriceAlertResponse from(PriceAlert alert) {
        return alert == null
                ? null
                : new PriceAlertResponse(
                        alert.direction(),
                        alert.targetPrice(),
                        alert.status(),
                        alert.setAt(),
                        alert.triggeredAt(),
                        alert.triggerPrice(),
                        alert.delivery());
    }
}
