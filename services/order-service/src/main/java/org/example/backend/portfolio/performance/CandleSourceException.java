package org.example.backend.portfolio.performance;

/** A candle call could not be completed. The message never contains the request URL or the API key. */
public class CandleSourceException extends RuntimeException {

    /** What went wrong, so the caller can tell "stop for today" from "try again next run". */
    public enum Kind { QUOTA, NOT_READY, FAILED }

    private final Kind kind;

    public CandleSourceException(String message, Kind kind) {
        super(message);
        this.kind = kind;
    }

    public CandleSourceException(String message, Throwable cause) {
        super(message, cause);
        this.kind = Kind.FAILED;
    }

    public Kind kind() {
        return kind;
    }

    /** HTTP 429: the daily quota is used up, so nothing more should be asked for today. */
    public boolean isQuotaExceeded() {
        return kind == Kind.QUOTA;
    }
}
