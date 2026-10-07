package org.example.backend.notifications.model;

import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * One row of the inbox as stored. {@code channels} is the comma-separated list resolved from Customer Preferences when
 * it was sent ({@code NONE} when the customer had opted out), kept as text so the decision can be shown, not claimed.
 */
public record Notification(
        long notificationId,
        long accountId,
        NotificationCategory category,
        String title,
        String message,
        String channels,
        OffsetDateTime createdAt,
        OffsetDateTime readAt) {

    /** The stored channel list as enums. {@code NONE}, and anything unrecognised, yields no channel. */
    public List<NotificationChannel> channelList() {
        List<NotificationChannel> parsed = new ArrayList<>();
        if (channels == null) {
            return parsed;
        }
        for (String part : channels.split(",")) {
            try {
                parsed.add(NotificationChannel.valueOf(part.trim()));
            } catch (IllegalArgumentException ignored) {
                // "NONE" or a value from a newer version: not a channel this version knows.
            }
        }
        return parsed;
    }
}
