package org.example.backend.preferences.model;

/**
 * Where a customer wants to be told about something. A channel is only a switch: the address behind it (email, phone)
 * is not stored with the preferences. "No notifications" is an empty set, not a value of this enum.
 */
public enum NotificationChannel {
    SMS,
    EMAIL,
    IN_APP
}
