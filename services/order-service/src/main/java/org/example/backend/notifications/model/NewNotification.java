package org.example.backend.notifications.model;

import org.example.backend.preferences.model.NotificationCategory;

import java.time.OffsetDateTime;

/**
 * A notification about to be inserted. It is a mutable holder, not a record, because MyBatis writes the generated key
 * back into {@code notificationId}; the key stays null when the event had already been recorded.
 */
public class NewNotification {

    private Long notificationId;
    private final long accountId;
    private final NotificationCategory category;
    private final String eventKey;
    private final String title;
    private final String message;
    private final String channels;
    private final boolean inApp;
    private final OffsetDateTime createdAt;

    public NewNotification(
            long accountId,
            NotificationCategory category,
            String eventKey,
            String title,
            String message,
            String channels,
            boolean inApp,
            OffsetDateTime createdAt) {
        this.accountId = accountId;
        this.category = category;
        this.eventKey = eventKey;
        this.title = title;
        this.message = message;
        this.channels = channels;
        this.inApp = inApp;
        this.createdAt = createdAt;
    }

    public Long getNotificationId() {
        return notificationId;
    }

    public void setNotificationId(Long notificationId) {
        this.notificationId = notificationId;
    }

    public long getAccountId() {
        return accountId;
    }

    public NotificationCategory getCategory() {
        return category;
    }

    public String getEventKey() {
        return eventKey;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public String getChannels() {
        return channels;
    }

    public boolean isInApp() {
        return inApp;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
