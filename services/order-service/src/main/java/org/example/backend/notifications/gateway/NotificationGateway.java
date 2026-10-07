package org.example.backend.notifications.gateway;

/**
 * The one door other modules use to have a customer told something: a Java interface, called in-process, never an
 * HTTP route. Publishing it as a route would let a customer send themselves anything, so the only things on the wire
 * are the customer's own inbox routes.
 *
 * <p>The caller says <em>what</em> to tell <em>which account</em>; it never says where. The channel is resolved from
 * Customer Preferences on every call, and the address for it is looked up here, so there is exactly one place on the
 * platform that decides how to reach a customer.
 *
 * <p>The call is idempotent on {@link NotificationRequest#eventKey()}: handing over the same event twice records one
 * notification and sends nothing the second time, which is what lets a caller retry safely after a failure.
 *
 * <p>It <b>raises</b> when the notification could not be durably recorded (the database is unavailable, the account
 * does not exist). A caller must decide what that means for it; the watchlist module keeps the alert visible as
 * "delivery failed" and retries a bounded number of times.
 */
public interface NotificationGateway {

    /**
     * Records the notification for delivery on the customer's resolved channels. Returns once it is durably
     * recorded; it does not wait for any external provider.
     *
     * @return {@link GatewayResult#RECORDED} if a new notification was recorded, {@link GatewayResult#DUPLICATE} if
     *         this event had already been handed over
     */
    GatewayResult deliver(NotificationRequest request);
}
