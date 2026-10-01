package org.example.backend.entities;

import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public class Instrument {

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

    public Instrument(
            int instrumentId,
            String instrumentTicker,
            String instrumentName,
            InstrumentAssetClass assetClass,
            InstrumentStatus instrumentStatus) {

        this.instrumentId = instrumentId;
        this.instrumentTicker = instrumentTicker;
        this.instrumentName = instrumentName;
        this.assetClass = assetClass;
        this.instrumentStatus = instrumentStatus;
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

    public boolean isTradable() {
        return instrumentStatus == InstrumentStatus.TRADING;
    }
}
