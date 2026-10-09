package org.example.backend.watchlist.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddWatchlistItemRequest(
        @NotBlank @Size(max = 20) String tickerSymbol) {
}

