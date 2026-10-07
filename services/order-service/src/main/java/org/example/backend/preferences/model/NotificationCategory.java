package org.example.backend.preferences.model;

/** What a customer wants to be told about. */
public enum NotificationCategory {
    /** An order they placed was FILLED or REJECTED. */
    ORDER_STATUS,
    WATCHLIST_ALERTS,
    /** An order placed by one of their automated strategies, or a strategy that stopped or expired. */
    STRATEGY_EXECUTION
}
