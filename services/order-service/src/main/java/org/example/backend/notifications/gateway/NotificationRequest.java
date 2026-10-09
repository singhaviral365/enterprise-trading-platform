package org.example.backend.notifications.gateway;

import org.example.backend.preferences.model.NotificationCategory;

import java.util.Objects;

/**
 * What a module asks the notifications module to tell a customer. There is deliberately no channel, address or URL
 * here: the caller cannot choose where a message goes, which also means there is no destination for a server-side
 * request forgery to ride on.
 *
 * @param accountId the account to tell
 * @param category  decides whether the customer's preferences want it at all
 * @param eventKey  idempotency key, unique per thing that happened (a Kafka {@code eventId}, or a stable alert key).
 *                  A second request with the same key is a no-op
 * @param title     short headline, at most 120 characters
 * @param message   plain text, at most 500 characters. Nothing sensitive: no credential, no card number, nothing the
 *                  event contract prohibits
 */
public record NotificationRequest(
        long accountId,
        NotificationCategory category,
        String eventKey,
        String title,
        String message) {

    public static final int MAX_EVENT_KEY = 120;
    public static final int MAX_TITLE = 120;
    public static final int MAX_MESSAGE = 500;

    public NotificationRequest {
        if (accountId < 1) {
            throw new IllegalArgumentException("Account id must be at least 1");
        }
        Objects.requireNonNull(category, "Category is required");
        eventKey = required(eventKey, "Event key", MAX_EVENT_KEY);
        title = required(title, "Title", MAX_TITLE);
        message = required(message, "Message", MAX_MESSAGE);
    }

    private static String required(String value, String name, int max) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new IllegalArgumentException(name + " cannot exceed " + max + " characters");
        }
        return trimmed;
    }
}
