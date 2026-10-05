package org.example.backend.watchlist.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameWatchlistRequest(
        @NotBlank @Size(max = 100) String name) {
}

