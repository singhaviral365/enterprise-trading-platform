package org.example.backend.watchlist.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.Objects;

public class Watchlist {

    @Positive
    private final long watchlistId;

    @Positive
    private final long accountId;

    @NotBlank
    @Size(max = 100)
    private final String name;

    @NotNull
    private final OffsetDateTime createdAt;

    @NotNull
    private final OffsetDateTime updatedAt;

    public Watchlist(
            long watchlistId,
            long accountId,
            String name,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        if (watchlistId < 1) {
            throw new IllegalArgumentException("Watchlist ID must be at least 1");
        }

        if (accountId < 1) {
            throw new IllegalArgumentException("Account ID must be at least 1");
        }

        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Watchlist name is required");
        }

        String normalizedName = name.trim();
        if (normalizedName.length() > 100) {
            throw new IllegalArgumentException("Watchlist name cannot exceed 100 characters");
        }

        this.watchlistId = watchlistId;
        this.accountId = accountId;
        this.name = normalizedName;
        this.createdAt = Objects.requireNonNull(createdAt, "Created time is required");
        this.updatedAt = Objects.requireNonNull(updatedAt, "Updated time is required");
    }

    public long getWatchlistId() {
        return watchlistId;
    }

    public long getAccountId() {
        return accountId;
    }

    public String getName() {
        return name;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}

