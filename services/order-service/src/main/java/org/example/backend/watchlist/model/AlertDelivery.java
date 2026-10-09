package org.example.backend.watchlist.model;

/**
 * How the hand-over of a fired alert to Customer Notifications went. This module never knows which channel was used:
 * that is decided, and recorded, by notifications.
 */
public enum AlertDelivery {

    /** Fired, not yet handed over (or being retried after a failure that has not exhausted its attempts). */
    PENDING,

    /** Notifications accepted it. */
    HANDED_OVER,

    /** Notifications raised. The hand-over is retried a bounded number of times, then this stays and is shown. */
    FAILED
}
