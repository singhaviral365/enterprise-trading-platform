package org.example.backend.notifications.dto;

import java.util.List;

/**
 * One page of the inbox. {@code totalItems} counts what matches the filters across all pages; {@code unreadCount} is
 * the account's unread total regardless of filters, for the bell badge.
 */
public record NotificationPageResponse(
        List<NotificationResponse> items,
        int page,
        int size,
        long totalItems,
        int totalPages,
        long unreadCount) {
}
