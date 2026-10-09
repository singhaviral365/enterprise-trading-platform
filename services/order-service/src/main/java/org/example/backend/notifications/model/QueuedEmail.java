package org.example.backend.notifications.model;

/** An email delivery waiting to be sent, with what the dispatcher needs. {@code recipient} is null if none is held. */
public record QueuedEmail(
        long deliveryId,
        long notificationId,
        int attempts,
        String title,
        String message,
        String recipient) {
}
