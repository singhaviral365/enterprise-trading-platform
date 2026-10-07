package org.example.backend.signals.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A question about one instrument's signal. {@code conversationHistory} is what was said before, oldest first; the server
 * stores nothing between requests, so the screen sends it each time. Only the last ten turns are used.
 */
public record ChatRequest(
        @NotNull @Min(1) Long accountId,
        @NotBlank @Size(max = 20) String symbol,
        @NotBlank @Size(max = 500) String message,
        @Valid @Size(max = 40) List<ChatTurnDto> conversationHistory) {
}
