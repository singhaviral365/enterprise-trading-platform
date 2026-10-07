package org.example.backend.strategy.dto;

import jakarta.validation.constraints.NotNull;

/** Switch a strategy off ({@code false}) or back on ({@code true}). Nothing else about a strategy can be edited. */
public record UpdateStrategyRequest(@NotNull Boolean enabled) {
}
