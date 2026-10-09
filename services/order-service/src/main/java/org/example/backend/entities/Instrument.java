package org.example.backend.entities;

import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.Objects;

public class Instrument {

    public static final String DEFAULT_CURRENCY = "USD";

    @Positive
    private final int instrumentId;

    @NotBlank
    @Size(max = 20)
    private final String instrumentTicker;

    @NotBlank
    @Size(max = 255)
    private final String instrumentName;

    @NotNull
    private final InstrumentAssetClass assetClass;

    @NotNull
    private InstrumentStatus instrumentStatus;

    /** ISO 4217 code the instrument is quoted and traded in, e.g. INR for INFY.NS. */
    @NotBlank
    @Size(min = 3, max = 3)
    private final String currency;

    /** Public path of the company logo, e.g. /assets/icons/AAPL.svg; null when there is none. */
    @Size(max = 255)
    private final String iconUrl;

    public Instrument(
            int instrumentId,
            String instrumentTicker,
            String instrumentName,
            InstrumentAssetClass assetClass,
            InstrumentStatus instrumentStatus) {

        this(instrumentId, instrumentTicker, instrumentName, assetClass, instrumentStatus, DEFAULT_CURRENCY, null);
    }

    public Instrument(
            int instrumentId,
            String instrumentTicker,
            String instrumentName,
            InstrumentAssetClass assetClass,
            InstrumentStatus instrumentStatus,
            String currency,
            String iconUrl) {

        if (instrumentId < 1) {
            throw new IllegalArgumentException(
                    "Instrument ID must be at least 1");
        }

        if (instrumentTicker == null || instrumentTicker.isBlank()) {
            throw new IllegalArgumentException(
                    "Instrument ticker is required");
        }

        if (instrumentTicker.length() > 20) {
            throw new IllegalArgumentException(
                    "Instrument ticker cannot exceed 20 characters");
        }

        Objects.requireNonNull(
                instrumentName,
                "Instrument name is required");

        if (instrumentName.isBlank()) {
            throw new IllegalArgumentException(
                    "Instrument name cannot be blank");
        }

        Objects.requireNonNull(
                assetClass,
                "Asset class is required");

        Objects.requireNonNull(
                instrumentStatus,
                "Instrument status is required");

        this.instrumentId = instrumentId;
        this.instrumentTicker = instrumentTicker;
        this.instrumentName = instrumentName;
        this.assetClass = assetClass;
        this.instrumentStatus = instrumentStatus;
        this.currency = currency == null || currency.isBlank() ? DEFAULT_CURRENCY : currency.trim().toUpperCase();
        this.iconUrl = iconUrl == null || iconUrl.isBlank() ? null : iconUrl.trim();
    }

    public int getInstrumentId() {
        return instrumentId;
    }

    public String getInstrumentTicker() {
        return instrumentTicker;
    }

    public String getInstrumentName() {
        return instrumentName;
    }

    public InstrumentAssetClass getAssetClass() {
        return assetClass;
    }

    public InstrumentStatus getInstrumentStatus() {
        return instrumentStatus;
    }

    public String getCurrency() {
        return currency;
    }

    public String getIconUrl() {
        return iconUrl;
    }

    public boolean isTradable() {
        return instrumentStatus == InstrumentStatus.TRADING;
    }
}
