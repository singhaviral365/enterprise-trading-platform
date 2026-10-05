package org.example.backend.exceptions;

/** Rule 3: the instrument does not exist, or exists but is not tradable. Catalogue {@code INS-404}. */
public final class InstrumentNotFoundException extends DomainException {

    private final String symbol;

    public InstrumentNotFoundException(String symbol) {
        super("INS-404", "Instrument not found");
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}
