package org.example.backend.watchlist.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;

public class WatchlistItem {

    @Positive
    private final long watchlistId;

    @NotBlank
    @Size(max = 20)
    private final String tickerSymbol;

    @NotNull
    private final OffsetDateTime addedAt;

    /** Null when the entry has no price alert. */
    private final PriceAlert alert;

    public WatchlistItem(long watchlistId, String tickerSymbol, OffsetDateTime addedAt) {
        this(watchlistId, tickerSymbol, addedAt, null, null, null, null, null, null, null);
    }

    /** The full row, as read from the database; the alert columns are all null when the entry has no alert. */
    public WatchlistItem(
            long watchlistId,
            String tickerSymbol,
            OffsetDateTime addedAt,
            AlertDirection alertDirection,
            BigDecimal alertTargetPrice,
            AlertStatus alertStatus,
            OffsetDateTime alertSetAt,
            OffsetDateTime alertTriggeredAt,
            BigDecimal alertTriggerPrice,
            AlertDelivery alertDelivery) {

        if (watchlistId < 1) {
            throw new IllegalArgumentException("Watchlist ID must be at least 1");
        }

        if (tickerSymbol == null || tickerSymbol.isBlank()) {
            throw new IllegalArgumentException("Ticker symbol is required");
        }

        String normalizedTicker = tickerSymbol.trim();
        if (normalizedTicker.length() > 20) {
            throw new IllegalArgumentException("Ticker symbol cannot exceed 20 characters");
        }

        this.watchlistId = watchlistId;
        this.tickerSymbol = normalizedTicker;
        this.addedAt = Objects.requireNonNull(addedAt, "Added time is required");
        this.alert = alertDirection == null
                ? null
                : new PriceAlert(
                        alertDirection, alertTargetPrice, alertStatus, alertSetAt,
                        alertTriggeredAt, alertTriggerPrice, alertDelivery);
    }

    public long getWatchlistId() {
        return watchlistId;
    }

    public String getTickerSymbol() {
        return tickerSymbol;
    }

    public OffsetDateTime getAddedAt() {
        return addedAt;
    }

    public PriceAlert getAlert() {
        return alert;
    }
}

