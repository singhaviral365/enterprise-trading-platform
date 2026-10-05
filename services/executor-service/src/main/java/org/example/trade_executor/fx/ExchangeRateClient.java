package org.example.trade_executor.fx;

/** Source of currency exchange rates. The only implementation calls ExchangeRate-API from the backend. */
public interface ExchangeRateClient {

    /** Latest rates with {@code baseCode} as the base currency (ISO 4217, upper case). */
    ExchangeRates fetchLatest(String baseCode);
}
