package org.example.backend.signals.dto;

import java.time.OffsetDateTime;

/** The assistant's answer, the signal it was about (computed fresh for this question), and where the words came from. */
public record ChatResponse(
        String response,
        String source,
        SignalResponse signal,
        OffsetDateTime timestamp) {
}
