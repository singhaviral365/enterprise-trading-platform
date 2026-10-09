package org.example.backend.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.List;

/** {@code HealthResponse} in {@code contracts/portfolio-api.yaml}. */
public record HealthResponse(String status, List<Dependency> dependencies, OffsetDateTime asOf) {

    /** @param quotaRemaining Fauxnance only; null when unknown */
    public record Dependency(String name, String status, @JsonInclude(JsonInclude.Include.ALWAYS) Integer quotaRemaining) {
    }
}
