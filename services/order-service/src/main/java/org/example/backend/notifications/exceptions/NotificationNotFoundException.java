package org.example.backend.notifications.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * No such notification on this account. A notification that exists but belongs to another account gets this same
 * answer, so the response does not reveal which ids are in use. Catalogue {@code NTF-404}.
 */
public final class NotificationNotFoundException extends DomainException {

    private final long notificationId;

    public NotificationNotFoundException(long notificationId) {
        super("NTF-404", "Notification not found");
        this.notificationId = notificationId;
    }

    public long getNotificationId() {
        return notificationId;
    }
}
