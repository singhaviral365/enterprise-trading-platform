package org.example.backend.signals.explain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.signals.config.SignalProperties;
import org.example.backend.signals.explain.TextGenerator.GenerationException;
import org.example.backend.signals.explain.TextGenerator.Generated;
import org.example.backend.signals.explain.TextGenerator.Turn;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Flow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Runs the client against a stubbed {@link HttpClient}, so what is checked is exactly what the client puts on the wire (the
 * address, the key header, the body) and how it reads what comes back, without a socket.
 */
class GeminiClientTest {

    private static final String KEY = "AIzaSy-secret-key-value";

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpClient http;

    @BeforeEach
    void setUp() {
        http = mock(HttpClient.class);
    }

    private GeminiClient client(String key) {
        return new GeminiClient(http, mapper,
                new SignalProperties(10, 24, 5, 90, key, "gemini-test", "https://gemini.test", 2000, 123, 60, 10, 50));
    }

    @SuppressWarnings("unchecked")
    private void answers(int status, String body) throws IOException, InterruptedException {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    private HttpRequest sent() throws IOException, InterruptedException {
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        return request.getValue();
    }

    /** What the request's body publisher would put on the wire. */
    private static String bodyOf(HttpRequest request) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                out.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable throwable) {
                throw new IllegalStateException(throwable);
            }

            @Override
            public void onComplete() {
            }
        });
        return out.toString(StandardCharsets.UTF_8);
    }

    @Test
    void isNotConfiguredWithoutAKey() {
        assertFalse(client("").isConfigured());
        assertTrue(client(KEY).isConfigured());
    }

    @Test
    void refusesToCallWithoutAKeyAndSendsNothing() throws Exception {
        assertThrows(GenerationException.class, () -> client("").generate("rules", List.of(Turn.user("hi"))));

        verify(http, never()).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void theKeyTravelsInAHeaderAndNeverInTheUrl() throws Exception {
        answers(200, "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}");

        client(KEY).generate("rules", List.of(Turn.user("hi")));

        HttpRequest request = sent();
        assertEquals("POST", request.method());
        assertEquals("https://gemini.test/v1beta/models/gemini-test:generateContent", request.uri().toString());
        assertEquals(KEY, request.headers().firstValue("x-goog-api-key").orElseThrow());
        assertFalse(request.uri().toString().contains(KEY));
        assertFalse(request.uri().getQuery() != null, "nothing is put in the query string");
    }

    @Test
    void sendsTheInstructionsApartFromTheConversationAndCapsTheOutput() throws Exception {
        answers(200, "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}");

        client(KEY).generate("THE RULES", List.of(Turn.user("question"), Turn.model("answer"), Turn.user("again")));

        JsonNode sent = mapper.readTree(bodyOf(sent()));
        assertEquals("THE RULES", sent.at("/systemInstruction/parts/0/text").asText());
        assertEquals(3, sent.get("contents").size());
        assertEquals("user", sent.at("/contents/0/role").asText());
        assertEquals("question", sent.at("/contents/0/parts/0/text").asText());
        assertEquals("model", sent.at("/contents/1/role").asText());
        assertEquals(123, sent.at("/generationConfig/maxOutputTokens").asInt());
        assertFalse(sent.has("tools"), "the model is given no tools: all it can produce is text");
    }

    @Test
    void theKeyIsNotInTheBodyEither() throws Exception {
        answers(200, "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}");

        client(KEY).generate("rules", List.of(Turn.user("hi")));

        assertFalse(bodyOf(sent()).contains(KEY));
    }

    @Test
    void readsTheTextAndTheTokensUsed() throws Exception {
        answers(200, """
                {"candidates":[{"content":{"parts":[{"text":"First. "},{"text":"Second."}]}}],
                 "usageMetadata":{"promptTokenCount":120,"candidatesTokenCount":35,"totalTokenCount":155}}""");

        Generated generated = client(KEY).generate("rules", List.of(Turn.user("hi")));

        assertEquals("First. Second.", generated.text());
        assertEquals(120, generated.promptTokens());
        assertEquals(35, generated.outputTokens());
    }

    @Test
    void aNon200AnswerIsAFailureThatDoesNotEchoAnything() throws Exception {
        answers(429, "{\"error\":{\"message\":\"quota for key " + KEY + " exceeded\"}}");

        GenerationException ex =
                assertThrows(GenerationException.class, () -> client(KEY).generate("rules", List.of(Turn.user("hi"))));

        assertEquals("Gemini answered HTTP 429", ex.getMessage());
        assertFalse(ex.getMessage().contains(KEY));
    }

    @Test
    void aBlockedPromptIsAFailure() throws Exception {
        answers(200, "{\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}");

        assertThrows(GenerationException.class, () -> client(KEY).generate("rules", List.of(Turn.user("hi"))));
    }

    @Test
    void anAnswerWithNoTextIsAFailure() throws Exception {
        answers(200, "{\"candidates\":[{\"content\":{\"parts\":[]},\"finishReason\":\"MAX_TOKENS\"}]}");

        assertThrows(GenerationException.class, () -> client(KEY).generate("rules", List.of(Turn.user("hi"))));
    }

    @Test
    void anAnswerThatIsNotJsonIsAFailure() throws Exception {
        answers(200, "<html>bad gateway</html>");

        assertThrows(GenerationException.class, () -> client(KEY).generate("rules", List.of(Turn.user("hi"))));
    }

    @Test
    void anUnreachableServerIsAFailureThatNamesNeitherTheKeyNorTheUrl() throws Exception {
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("connect to https://gemini.test failed with key " + KEY));

        GenerationException ex =
                assertThrows(GenerationException.class, () -> client(KEY).generate("rules", List.of(Turn.user("hi"))));

        assertEquals("Gemini could not be reached (IOException)", ex.getMessage());
        assertFalse(ex.getMessage().contains(KEY));
    }
}
