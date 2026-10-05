package org.example.trade_executor.market;

import org.example.backend.entities.Instrument;
import org.example.backend.mapper.InstrumentMapper;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteDetails;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.example.trade_executor.fx.CurrencyConversionService;
import org.example.trade_executor.fx.ExchangeRates;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class MarketQuoteService {

    static final int MAX_SYMBOLS_PER_REQUEST = 25;

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketQuoteService.class);

    private final InstrumentMapper instrumentMapper;
    private final QuoteClient quoteClient;
    private final CurrencyConversionService currencyConversionService;
    private final Duration cacheTtl;
    private final Clock clock;

    private volatile Snapshot cachedSnapshot;

    // Two constructors exist (the other is for tests), so Spring must be told which one to use.
    @Autowired
    public MarketQuoteService(
            InstrumentMapper instrumentMapper,
            QuoteClient quoteClient,
            CurrencyConversionService currencyConversionService,
            @Value("${trading.market.cache-ttl-seconds:30}") long cacheTtlSeconds) {

        this(instrumentMapper, quoteClient, currencyConversionService, cacheTtlSeconds, Clock.systemUTC());
    }

    MarketQuoteService(
            InstrumentMapper instrumentMapper,
            QuoteClient quoteClient,
            CurrencyConversionService currencyConversionService,
            long cacheTtlSeconds,
            Clock clock) {

        this.instrumentMapper = instrumentMapper;
        this.quoteClient = quoteClient;
        this.currencyConversionService = currencyConversionService;
        this.cacheTtl = Duration.ofSeconds(Math.max(1L, cacheTtlSeconds));
        this.clock = clock;
    }

    public synchronized MarketBoard getBoard() {
        Instant now = clock.instant();
        Snapshot snapshot = cachedSnapshot;

        if (snapshot != null && Duration.between(snapshot.fetchedAt(), now).compareTo(cacheTtl) < 0) {
            return snapshot.board();
        }

        List<Instrument> instruments = instrumentMapper.selectTradableInstruments();
        if (instruments == null || instruments.isEmpty()) {
            MarketBoard emptyBoard = new MarketBoard(List.of(), OffsetDateTime.ofInstant(now, ZoneOffset.UTC).toString(), false);
            cachedSnapshot = new Snapshot(emptyBoard, now);
            return emptyBoard;
        }

        // Skip rows without a ticker: they cannot be quoted, and a null ticker would break the sort.
        List<Instrument> ordered = instruments.stream()
                .filter(Objects::nonNull)
                .filter(instrument -> instrument.getInstrumentTicker() != null
                        && !instrument.getInstrumentTicker().isBlank())
                .sorted(Comparator.comparing(Instrument::getInstrumentTicker))
                .toList();

        List<String> symbols = ordered.stream()
                .map(Instrument::getInstrumentTicker)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();

        try {
            // Fauxnance accepts at most MAX_SYMBOLS_PER_REQUEST symbols per call (same limit as MarketDataPoller).
            Map<String, QuoteDetails> safeQuotes = new LinkedHashMap<>();
            for (int start = 0; start < symbols.size(); start += MAX_SYMBOLS_PER_REQUEST) {
                List<String> batch = symbols.subList(start, Math.min(symbols.size(), start + MAX_SYMBOLS_PER_REQUEST));
                Map<String, QuoteDetails> batchQuotes = quoteClient.getQuoteDetails(batch);
                if (batchQuotes != null) {
                    safeQuotes.putAll(batchQuotes);
                }
            }

            List<MarketQuote> marketQuotes = new ArrayList<>(ordered.size());
            for (Instrument instrument : ordered) {
                String symbol = instrument.getInstrumentTicker();
                QuoteDetails quote = safeQuotes.get(symbol);

                // details carries every field Fauxnance returned (change, changePercent, marketState, bid, ask, ...).
                marketQuotes.add(new MarketQuote(
                        symbol,
                        instrument.getInstrumentName(),
                        instrument.getAssetClass() == null ? null : instrument.getAssetClass().name(),
                        quote == null ? null : quote.price(),
                        quote == null ? null : quote.fields(),
                        quoteCurrency(quote, instrument),
                        instrument.getIconUrl()));
            }

            // Rates are best effort: without them the board still works, it just cannot show converted amounts.
            ExchangeRates rates = currencyConversionService.currentRatesIfAvailable().orElse(null);
            MarketBoard freshBoard = new MarketBoard(
                    marketQuotes,
                    OffsetDateTime.ofInstant(now, ZoneOffset.UTC).toString(),
                    false,
                    rates == null ? null : rates.baseCode(),
                    rates == null ? null : rates.rates());

            cachedSnapshot = new Snapshot(freshBoard, now);
            return freshBoard;
        } catch (QuoteUnavailableException ex) {
            LOGGER.warn("Market quote refresh failed", ex);
            if (snapshot != null) {
                MarketBoard staleBoard = new MarketBoard(
                        snapshot.board().quotes(),
                        snapshot.board().asOf(),
                        true,
                        snapshot.board().baseCurrency(),
                        snapshot.board().fxRates());
                // Re-arm the TTL so an outage costs one Fauxnance call per TTL, not one per request.
                cachedSnapshot = new Snapshot(staleBoard, now);
                return staleBoard;
            }

            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Live market data unavailable", ex);
        }
    }

    /** The quote API's own currency when it reports one, else the instrument's. */
    private static String quoteCurrency(QuoteDetails quote, Instrument instrument) {
        Object reported = quote == null ? null : quote.fields().get("currency");
        return reported instanceof String code && code.trim().length() == 3
                ? code.trim().toUpperCase()
                : instrument.getCurrency();
    }

    private record Snapshot(MarketBoard board, Instant fetchedAt) {
    }
}
