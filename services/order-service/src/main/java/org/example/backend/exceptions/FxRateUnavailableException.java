package org.example.backend.exceptions;

/**
 * A limit price could not be converted to the account currency because the exchange rate service is
 * unavailable. Catalogue {@code FX-503}.
 */
public final class FxRateUnavailableException extends DomainException {

    private final String fromCurrency;
    private final String toCurrency;

    public FxRateUnavailableException(String fromCurrency, String toCurrency) {
        super("FX-503", "Exchange rate unavailable");
        this.fromCurrency = fromCurrency;
        this.toCurrency = toCurrency;
    }

    public String getFromCurrency() {
        return fromCurrency;
    }

    public String getToCurrency() {
        return toCurrency;
    }
}
