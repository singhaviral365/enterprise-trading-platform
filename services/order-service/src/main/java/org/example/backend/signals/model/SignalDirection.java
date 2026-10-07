package org.example.backend.signals.model;

/** What the indicators say. A description of the chart, not an instruction to trade. */
public enum SignalDirection {
    /** The 20-day average is above the 50-day and the price is above the 20-day. */
    BUY,
    /** The 20-day average is below the 50-day and the price is below the 20-day. */
    SELL,
    /** Neither of the two. */
    HOLD
}
