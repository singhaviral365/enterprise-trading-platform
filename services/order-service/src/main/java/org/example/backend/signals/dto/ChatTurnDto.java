package org.example.backend.signals.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** One earlier message of the conversation. The screen keeps the conversation; the server keeps none. */
public record ChatTurnDto(
        @NotBlank @Pattern(regexp = "user|assistant") String role,
        @NotBlank @Size(max = 2000) String content) {
}
