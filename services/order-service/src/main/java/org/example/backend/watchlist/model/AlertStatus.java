package org.example.backend.watchlist.model;

/** ACTIVE is armed. TRIGGERED has fired once and will not fire again unless the customer replaces it. */
public enum AlertStatus {
    ACTIVE,
    TRIGGERED
}
