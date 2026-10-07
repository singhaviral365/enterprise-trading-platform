package org.example.backend.signals.explain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.signals.config.SignalProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Gemini's {@code generateContent}, over HTTPS, with the JDK's own client: one POST, no SDK, nothing to keep in step with a
 * library's idea of what a model is called.
 *
 * <p>The key goes in the {@code x-goog-api-key} header, never in the URL, so it cannot end up in an access log or a proxy.
 * Error messages and logs carry the HTTP status and nothing from the request or the response body, which can echo a
 * customer's question back. One attempt, no retry: the explainer falls back to its own text, and a retry would spend the
 * free tier's per-minute allowance a second time on the same question.
 */
@Component
public class GeminiClient implements TextGenerator {

    private static final Logger LOGGER = LoggerFactory.getLogger(GeminiClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final SignalProperties properties;

    @Autowired
    public GeminiClient(SignalProperties properties) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build(), new ObjectMapper(), properties);
    }

    GeminiClient(HttpClient httpClient, ObjectMapper objectMapper, SignalProperties properties) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public boolean isConfigured() {
        return properties.geminiConfigured();
    }

    @Override
    public Generated generate(String systemInstruction, List<Turn> turns) {
        if (!isConfigured()) {
            throw new GenerationException("Gemini is not configured");
        }

        String base = properties.geminiBaseUrl();
        URI uri = URI.create((base.endsWith("/") ? base : base + "/") + "v1beta/models/"
                + URLEncoder.encode(properties.geminiModel(), StandardCharsets.UTF_8) + ":generateContent");

        final String body;
        try {
            body = objectMapper.writeValueAsString(requestBody(systemInstruction, turns));
        } catch (IOException ex) {
            throw new GenerationException("The request could not be written", ex);
        }

        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(properties.geminiTimeout())
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", properties.geminiApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        final HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new GenerationException("Gemini could not be reached", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new GenerationException("The call to Gemini was interrupted", ex);
        }

        if (response.statusCode() != 200) {
            LOGGER.warn("Gemini answered HTTP {}", response.statusCode());
            throw new GenerationException("Gemini answered HTTP " + response.statusCode());
        }
        return parse(response.body());
    }

    Map<String, Object> requestBody(String systemInstruction, List<Turn> turns) {
        List<Map<String, Object>> contents = new ArrayList<>();
        for (Turn turn : turns) {
            contents.add(Map.of("role", turn.role(), "parts", List.of(Map.of("text", turn.text()))));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("systemInstruction", Map.of("parts", List.of(Map.of("text", systemInstruction))));
        body.put("contents", contents);
        body.put("generationConfig", Map.of(
                "maxOutputTokens", properties.geminiMaxOutputTokens(),
                "temperature", 0.3));
        return body;
    }

    Generated parse(String json) {
        final JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (IOException ex) {
            throw new GenerationException("Gemini answered something that is not JSON", ex);
        }
        if (root == null) {
            throw new GenerationException("Gemini answered nothing");
        }

        JsonNode blocked = root.path("promptFeedback").path("blockReason");
        if (!blocked.isMissingNode() && !blocked.isNull()) {
            throw new GenerationException("Gemini blocked the request");
        }

        StringBuilder text = new StringBuilder();
        for (JsonNode part : root.path("candidates").path(0).path("content").path("parts")) {
            JsonNode piece = part.get("text");
            if (piece != null && piece.isTextual()) {
                text.append(piece.asText());
            }
        }
        if (text.toString().isBlank()) {
            throw new GenerationException("Gemini answered with no text");
        }

        JsonNode usage = root.path("usageMetadata");
        return new Generated(
                text.toString().trim(),
                usage.path("promptTokenCount").asInt(0),
                usage.path("candidatesTokenCount").asInt(0));
    }
}
