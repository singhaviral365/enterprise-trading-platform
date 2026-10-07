package org.example.backend.signals.model;

/** How the 20-day average stands against the 50-day one. */
public enum SmaStatus {
    /** The 20-day average is above the 50-day: the recent trend is up. */
    BULLISH,
    /** The 20-day average is below the 50-day: the recent trend is down. */
    BEARISH,
    /** The two are equal. */
    FLAT
}
