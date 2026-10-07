package org.example.backend.notifications.model;

/**
 * Where one delivery on a non-in-app channel stands. Tracked per channel and separately from the Kafka offset: the
 * offset says what was read, this says what reached a customer.
 */
public enum DeliveryStatus {

    /** Recorded, not yet attempted. */
    QUEUED,

    /** The provider accepted it. */
    SENT,

    /** Attempts are exhausted. */
    FAILED,

    /** Nothing was sent, by design: the channel is switched off, not provisioned, or no address is held. */
    SKIPPED
}
