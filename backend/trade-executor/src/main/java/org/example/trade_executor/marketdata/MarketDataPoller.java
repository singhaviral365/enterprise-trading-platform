package org.example.trade_executor.marketdata;

import org.example.backend.mapper.InstrumentMapper;
import org.example.trade_executor.client.LiveQuote;
import org.example.trade_executor.client.QuoteClient;
import org.example.trade_executor.client.QuoteUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class MarketDataPoller {

    static final int MAX_SYMBOLS_PER_REQUEST = 25;
    static final long DAILY_REQUEST_QUOTA = 2000L;
    static final long SECONDS_PER_DAY = 86_400L;

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketDataPoller.class);

    private final InstrumentMapper instrumentMapper;
    private final QuoteClient quoteClient;
    private final MarketDataEventProducer marketDataEventProducer;
    private final long configuredIntervalSeconds;
    private final Set<String> watchSymbols;
    private final Clock clock;

    private Instant lastPollAt = Instant.EPOCH;

    @Autowired
    public MarketDataPoller(
            InstrumentMapper instrumentMapper,
            QuoteClient quoteClient,
            MarketDataEventProducer marketDataEventProducer,
            @Value("${trading.market-data.poll-interval-seconds:${POLL_INTERVAL_SECONDS:60}}") long pollIntervalSeconds,
            @Value("${trading.market-data.watch-symbols:}") String watchSymbolsCsv) {

        this(
                instrumentMapper,
                quoteClient,
                marketDataEventProducer,
                pollIntervalSeconds,
                watchSymbolsCsv,
                Clock.systemUTC());
    }

    MarketDataPoller(
            InstrumentMapper instrumentMapper,
            QuoteClient quoteClient,
            MarketDataEventProducer marketDataEventProducer,
            long pollIntervalSeconds,
            String watchSymbolsCsv,
            Clock clock) {

        this.instrumentMapper = instrumentMapper;
        this.quoteClient = quoteClient;
        this.marketDataEventProducer = marketDataEventProducer;
        this.configuredIntervalSeconds = Math.max(1L, pollIntervalSeconds);
        this.watchSymbols = parseWatchSymbols(watchSymbolsCsv);
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${trading.market-data.poll-interval-seconds:${POLL_INTERVAL_SECONDS:60}}", timeUnit = java.util.concurrent.TimeUnit.SECONDS)
    public void poll() {
        List<String> symbols = loadSymbolsToPoll();
        if (symbols.isEmpty()) {
            LOGGER.debug("Skipping market-data poll because no held or watched symbols were found");
            return;
        }

        long effectiveIntervalSeconds = calculateEffectiveIntervalSeconds(symbols.size(), configuredIntervalSeconds);
        Instant now = clock.instant();
        if (Duration.between(lastPollAt, now).getSeconds() < effectiveIntervalSeconds) {
            LOGGER.debug(
                    "Skipping market-data poll. elapsed={}s required={}s configured={}s symbols={} requests/day={}",
                    Duration.between(lastPollAt, now).getSeconds(),
                    effectiveIntervalSeconds,
                    configuredIntervalSeconds,
                    symbols.size(),
                    requestsPerDay(symbols.size(), effectiveIntervalSeconds));
            return;
        }

        lastPollAt = now;
        OffsetDateTime quotedAt = OffsetDateTime.ofInstant(now, ZoneOffset.UTC);

        for (List<String> batch : partition(symbols, MAX_SYMBOLS_PER_REQUEST)) {
            publishBatch(batch, quotedAt);
        }
    }

    static long calculateEffectiveIntervalSeconds(int symbolCount, long configuredIntervalSeconds) {
        long safeConfigured = Math.max(1L, configuredIntervalSeconds);
        if (symbolCount <= 0) {
            return safeConfigured;
        }

        long requestsPerPoll = (long) Math.ceil((double) symbolCount / MAX_SYMBOLS_PER_REQUEST);
        long minimumForQuota = (long) Math.ceil((double) (requestsPerPoll * SECONDS_PER_DAY) / DAILY_REQUEST_QUOTA);
        return Math.max(safeConfigured, Math.max(1L, minimumForQuota));
    }

    static long requestsPerDay(int symbolCount, long intervalSeconds) {
        if (symbolCount <= 0) {
            return 0L;
        }

        long requestsPerPoll = (long) Math.ceil((double) symbolCount / MAX_SYMBOLS_PER_REQUEST);
        return (requestsPerPoll * SECONDS_PER_DAY) / Math.max(1L, intervalSeconds);
    }

    private List<String> loadSymbolsToPoll() {
        Set<String> symbols = new LinkedHashSet<>();

        List<String> dbSymbols = instrumentMapper.selectSymbolsForMarketPolling();
        if (dbSymbols != null) {
            symbols.addAll(dbSymbols.stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .collect(Collectors.toCollection(LinkedHashSet::new)));
        }
        symbols.addAll(watchSymbols);

        List<String> result = new ArrayList<>(symbols);
        Collections.sort(result);
        return result;
    }

    private void publishBatch(List<String> batch, OffsetDateTime quotedAt) {
        try {
            Map<String, LiveQuote> quotes = quoteClient.getQuotes(batch);
            if (quotes == null || quotes.isEmpty()) {
                LOGGER.info("No quotes returned for market-data batch size={} symbols={}", batch.size(), batch);
                return;
            }

            quotes.values().forEach(quote -> marketDataEventProducer.publish(quote, quotedAt));
        } catch (QuoteUnavailableException ex) {
            LOGGER.warn("Market-data batch quote request failed for symbols {}", batch, ex);
        }
    }

    private static Set<String> parseWatchSymbols(String csv) {
        if (csv == null || csv.isBlank()) {
            return Set.of();
        }

        return java.util.Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static List<List<String>> partition(Collection<String> symbols, int batchSize) {
        List<String> values = new ArrayList<>(symbols);
        List<List<String>> partitions = new ArrayList<>();
        for (int start = 0; start < values.size(); start += batchSize) {
            int end = Math.min(start + batchSize, values.size());
            partitions.add(values.subList(start, end));
        }
        return partitions;
    }
}