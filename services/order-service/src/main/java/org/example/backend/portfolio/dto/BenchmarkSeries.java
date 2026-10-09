package org.example.backend.portfolio.dto;

import java.util.List;

/** A broad index or ETF over the same range, from its adjusted closes (only the ratio matters, so it needs no currency). */
public record BenchmarkSeries(String symbol, List<BenchmarkPoint> points) {
}
