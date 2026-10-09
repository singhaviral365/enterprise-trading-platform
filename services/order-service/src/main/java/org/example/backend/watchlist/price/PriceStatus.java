package org.example.backend.watchlist.price;

public enum PriceStatus {
    /** A recent quote is available. */
    LIVE,
    /** A quote exists but is older than the configured threshold. */
    STALE,
    /** No quote has been received for this symbol yet. */
    UNAVAILABLE
}
