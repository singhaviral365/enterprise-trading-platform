package org.example.backend.portfolio.dto;

/** The body of {@code 202}: the history is being built for the first time. Ask again in a moment. */
public record PerformanceBuilding(String status) {
    public static PerformanceBuilding building() {
        return new PerformanceBuilding("building");
    }
}
