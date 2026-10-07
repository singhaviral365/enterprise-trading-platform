package org.example.backend.portfolio.exceptions;

import org.example.backend.exceptions.DomainException;

/**
 * No price could be obtained for any held instrument (Fauxnance unreachable, quota exhausted, or no exchange rate).
 * Catalogue {@code MKT-503}. When only some holdings cannot be priced the answer is a partial {@code 200} instead.
 */
public final class PricingUnavailableException extends DomainException {

    public PricingUnavailableException() {
        super("MKT-503", "Pricing unavailable");
    }
}
