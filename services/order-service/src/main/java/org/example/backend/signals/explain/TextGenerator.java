package org.example.backend.signals.explain;

import java.util.List;

/**
 * Whatever turns a conversation into text. A seam, so the explainer and the chat are tested without a network and without
 * a key: the platform's only implementation talks to Gemini, and nothing else in the module knows that.
 */
public interface TextGenerator {

    /** One message of the conversation. {@code role} is {@code user} or {@code model}. */
    record Turn(String role, String text) {
        public static Turn user(String text) {
            return new Turn("user", text);
        }

        public static Turn model(String text) {
            return new Turn("model", text);
        }
    }

    /** What came back, with the tokens it cost, for the metrics. */
    record Generated(String text, int promptTokens, int outputTokens) {
    }

    /** False when no key is configured: nothing is sent anywhere and the module answers from its own text. */
    boolean isConfigured();

    /** @throws GenerationException when no usable text came back for any reason */
    Generated generate(String systemInstruction, List<Turn> turns);

    /** The call failed, was blocked, timed out, or answered with nothing. The message never contains the key or the URL. */
    class GenerationException extends RuntimeException {
        public GenerationException(String message) {
            super(message);
        }

        public GenerationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
