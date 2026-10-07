package org.example.backend.portfolio.exceptions;

import org.example.backend.exceptions.DomainException;

/** The performance history is switched off ({@code portfolio.performance.enabled=false}). Catalogue {@code PRF-503}. */
public final class PerformanceDisabledException extends DomainException {

    public PerformanceDisabledException() {
        super("PRF-503", "Performance history unavailable");
    }
}
