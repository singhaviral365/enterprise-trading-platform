package org.example.backend.notifications.dto;

import org.example.backend.notifications.model.Notification;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;

import java.time.OffsetDateTime;
import java.util.List;

/** One notification as the inbox shows it. {@code readAt} is null while unread. */
public record NotificationResponse(
        long notificationId,
        NotificationCategory category,
        String title,
        String message,
        OffsetDateTime createdAt,
        OffsetDateTime readAt,
        List<NotificationChannel> channels) {

    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.notificationId(),
                notification.category(),
                notification.title(),
                notification.message(),
                notification.createdAt(),
                notification.readAt(),
                notification.channelList());
    }
}
