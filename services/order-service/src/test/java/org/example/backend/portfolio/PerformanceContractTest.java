package org.example.backend.portfolio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.example.backend.portfolio.dto.BenchmarkPoint;
import org.example.backend.portfolio.dto.BenchmarkSeries;
import org.example.backend.portfolio.dto.NavPoint;
import org.example.backend.portfolio.dto.PerformanceBuilding;
import org.example.backend.portfolio.dto.PerformanceResponse;
import org.example.backend.portfolio.dto.PerformanceSummary;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Each response is serialised and its field names are compared with the schema in {@code contracts/portfolio-performance-api.yaml}. */
class PerformanceContractTest {

    private static final Path CONTRACT = Path.of("..", "..", "contracts", "portfolio-performance-api.yaml");
    private static final ObjectMapper JSON = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final BigDecimal N = BigDecimal.ONE;
    private static final LocalDate D = LocalDate.of(2026, 9, 1);

    @SuppressWarnings("unchecked")
    private static Set<String> propertiesOf(String schema) throws IOException {
        assumeTrue(Files.exists(CONTRACT), CONTRACT.toAbsolutePath() + " is not reachable from this working directory");
        Map<String, Object> document = new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
        Map<String, Object> schemas = (Map<String, Object>) ((Map<String, Object>) document.get("components")).get("schemas");
        return new TreeSet<>(((Map<String, Object>) ((Map<String, Object>) schemas.get(schema)).get("properties")).keySet());
    }

    private static Set<String> fieldsOf(Object dto) {
        JsonNode node = JSON.valueToTree(dto);
        Set<String> names = new TreeSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    @Test
    void theResponseHasExactlyTheContractsFields() throws IOException {
        var point = new NavPoint(D, N, N, N, N, N, N, false);
        var summary = new PerformanceSummary(N, N, N, N, N, N);
        var benchmark = new BenchmarkSeries("SPY", List.of(new BenchmarkPoint(D, N)));
        var response = new PerformanceResponse(1, "USD", false, D, summary, List.of(point), benchmark);

        assertEquals(propertiesOf("PerformanceResponse"), fieldsOf(response));
        assertEquals(propertiesOf("NavPoint"), fieldsOf(point));
        assertEquals(propertiesOf("PerformanceSummary"), fieldsOf(summary));
        assertEquals(propertiesOf("BenchmarkSeries"), fieldsOf(benchmark));
        assertEquals(propertiesOf("BenchmarkPoint"), fieldsOf(benchmark.points().get(0)));
        assertEquals(propertiesOf("PerformanceBuilding"), fieldsOf(PerformanceBuilding.building()));
    }

    @Test
    void theBenchmarkIsAbsentNotNullWhenNoneWasAskedFor() throws IOException {
        var response = new PerformanceResponse(1, "USD", false, null, null, List.of(), null);

        Set<String> expected = propertiesOf("PerformanceResponse");
        expected.remove("benchmark");
        assertEquals(expected, fieldsOf(response));
    }
}
