package org.example.backend.watchlist.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

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

    public WatchlistItem(long watchlistId, String tickerSymbol, OffsetDateTime addedAt) {

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
}

