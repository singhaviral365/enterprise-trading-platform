package org.example.backend.notifications.gateway;

/** What {@link NotificationGateway#deliver} did. Both outcomes mean the customer will not be told twice. */
public enum GatewayResult {

    /** A new notification was recorded and routed. */
    RECORDED,

    /** The same event had already been handed over; nothing was recorded or sent. */
    DUPLICATE
}
