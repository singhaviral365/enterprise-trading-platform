package org.example.backend.portfolio.quote;

/** A quote call could not be completed. The message never contains the request URL or the API key. */
public class QuoteSourceException extends RuntimeException {

    private final boolean quotaExceeded;

    public QuoteSourceException(String message, boolean quotaExceeded) {
        super(message);
        this.quotaExceeded = quotaExceeded;
    }

    public QuoteSourceException(String message, Throwable cause) {
        super(message, cause);
        this.quotaExceeded = false;
    }

    /** True for HTTP 429: the daily quota is used up, so retrying straight away only makes it worse. */
    public boolean isQuotaExceeded() {
        return quotaExceeded;
    }
}
