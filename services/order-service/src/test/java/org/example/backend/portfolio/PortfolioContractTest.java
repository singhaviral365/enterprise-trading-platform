package org.example.backend.portfolio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.example.backend.portfolio.dto.HealthResponse;
import org.example.backend.portfolio.dto.PnlResponse;
import org.example.backend.portfolio.dto.PortfolioSummaryResponse;
import org.example.backend.portfolio.dto.PricedPositionResponse;
import org.example.backend.portfolio.dto.RealisedBySymbol;
import org.example.backend.portfolio.dto.RealisedPnlResponse;
import org.example.backend.portfolio.dto.SymbolPnl;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * "The exact field names the contract fixes": each response is serialised and its field names are compared with the
 * schema in {@code contracts/portfolio-api.yaml}. A renamed, dropped or invented field fails here, not in a customer's
 * browser. The contract is also the source the Angular client is generated from, so both ends follow the same file.
 */
class PortfolioContractTest {

    private static final Path CONTRACT = Path.of("..", "..", "contracts", "portfolio-api.yaml");
    private static final ObjectMapper JSON = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @SuppressWarnings("unchecked")
    private static Map<String, Object> schemas() throws IOException {
        assumeTrue(Files.exists(CONTRACT), CONTRACT.toAbsolutePath() + " is not reachable from this working directory");
        Map<String, Object> document = new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
        return (Map<String, Object>) ((Map<String, Object>) document.get("components")).get("schemas");
    }

    @SuppressWarnings("unchecked")
    private static Set<String> propertiesOf(String schema) throws IOException {
        Map<String, Object> definition = (Map<String, Object>) schemas().get(schema);
        return new TreeSet<>(((Map<String, Object>) definition.get("properties")).keySet());
    }

    @SuppressWarnings("unchecked")
    private static Set<String> requiredOf(String schema) throws IOException {
        Map<String, Object> definition = (Map<String, Object>) schemas().get(schema);
        return new TreeSet<>(new HashSet<>((List<String>) definition.get("required")));
    }

    private static Set<String> fieldsOf(Object dto) {
        JsonNode node = JSON.valueToTree(dto);
        Set<String> names = new TreeSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private static final BigDecimal N = new BigDecimal("1.00");
    private static final OffsetDateTime T = OffsetDateTime.parse("2026-10-07T12:00:00Z");

    @Test
    void thePortfolioSummaryHasExactlyTheContractsFields() throws IOException {
        var dto = new PortfolioSummaryResponse(1, "USD", N, N, N, N, N, N, N, 1, false, N, N, T);

        assertEquals(propertiesOf("PortfolioSummary"), fieldsOf(dto));
    }

    @Test
    void aPricedPositionHasExactlyTheContractsFields() throws IOException {
        var dto = new PricedPositionResponse(1, "AAPL", 1, N, N, N, N, N, N, N, N, N, "USD", T, false);

        assertEquals(propertiesOf("PricedPosition"), fieldsOf(dto));
    }

    @Test
    void thePnlResponseHasExactlyTheContractsFieldsWhenTheBreakdownIsAsked() throws IOException {
        var dto = new PnlResponse(1, "USD", LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 19), N, N, N, N,
                List.of(new SymbolPnl("AAPL", N, N, N)), T);

        assertEquals(propertiesOf("PnlResponse"), fieldsOf(dto));
        assertEquals(propertiesOf("SymbolPnl"), fieldsOf(dto.bySymbol().get(0)));
    }

    @Test
    void theRealisedResponseHasExactlyTheContractsFields() throws IOException {
        var dto = new RealisedPnlResponse(1, "USD", LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 19), N,
                List.of(new RealisedBySymbol("AAPL", N)), T);

        assertEquals(propertiesOf("RealisedPnlResponse"), fieldsOf(dto));
        assertEquals(propertiesOf("SymbolRealised"), fieldsOf(dto.bySymbol().get(0)));
        assertTrue(fieldsOf(new RealisedPnlResponse(1, "USD", null, null, N, null, T)).containsAll(requiredOf("RealisedPnlResponse")));
    }

    @Test
    void theBreakdownIsAbsentNotNullWhenItWasNotAsked() throws IOException {
        var dto = new PnlResponse(1, "USD", null, null, N, N, N, null, null, T);

        Set<String> expected = propertiesOf("PnlResponse");
        expected.remove("bySymbol");
        assertEquals(expected, fieldsOf(dto));
    }

    @Test
    void theHealthResponseHasExactlyTheContractsFields() throws IOException {
        var dto = new HealthResponse("ok", List.of(new HealthResponse.Dependency("postgres", "ok", null)), T);

        assertEquals(propertiesOf("HealthResponse"), fieldsOf(dto));
        JsonNode dependency = JSON.valueToTree(dto).get("dependencies").get(0);
        List<String> names = new ArrayList<>();
        dependency.fieldNames().forEachRemaining(names::add);
        assertTrue(names.containsAll(List.of("name", "status")));
    }

    @Test
    void everyFieldTheContractRequiresIsAlwaysPresentOnTheDtos() throws IOException {
        assertTrue(fieldsOf(new PortfolioSummaryResponse(1, "USD", N, N, N, N, null, N, N, 0, false, null, null, T))
                .containsAll(requiredOf("PortfolioSummary")));
        assertTrue(fieldsOf(new PricedPositionResponse(1, "AAPL", 1, N, N, null, null, null, null, null, null, null, "USD", null, true))
                .containsAll(requiredOf("PricedPosition")), "required fields are present even when a price is not");
        assertTrue(fieldsOf(new PnlResponse(1, "USD", null, null, N, N, N, null, null, T))
                .containsAll(requiredOf("PnlResponse")));
    }

    @Test
    void theContractDeclaresTheCatalogueThisModuleUses() throws IOException {
        String contract = Files.readString(CONTRACT, StandardCharsets.UTF_8);
        for (String code : List.of("ACC-404", "ACC-403", "AUTH-401", "VAL-422", "MKT-503")) {
            assertTrue(contract.contains(code), code);
        }
    }
}
