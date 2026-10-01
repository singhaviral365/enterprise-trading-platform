package org.example.backend.watchlist.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record WatchlistResponse(
        Long watchlistId,
        Long accountId,
        String name,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<WatchlistItemResponse> items) {
}

