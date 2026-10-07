package org.example.backend.portfolio.performance;

import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The daily closes the history is valued with, kept in {@code price_candle_daily} and shared by every account. A symbol is
 * fetched <b>once for a range</b>, never per account and never per day: the first time it is needed the whole range is
 * fetched in one call, and after that each run tops it up with one call that also re-fetches the last few days, so a
 * synthetic candle that Fauxnance later replaces with a real one heals itself.
 *
 * <p>Calls are counted against a {@link CandleBudget}. A quota error stops the run (nothing more is asked for today);
 * any other failure leaves the symbol for the next run. A symbol Fauxnance does not know is not asked about again for a day.
 */
@Component
public class CandleStore {

    private static final Logger LOGGER = LoggerFactory.getLogger(CandleStore.class);

    /** How much earlier than the first stored day a request must reach before it is worth asking for the missing history. */
    private static final int BACKFILL_SLACK_DAYS = 7;
    /** Do not ask about the same symbol more often than this, however often the job or a request calls. */
    private static final Duration MIN_GAP = Duration.ofHours(6);

    private final CandleSource source;
    private final PerformanceMapper mapper;
    private final int healDays;
    private final Clock clock;

    private final Map<String, Instant> attemptedAt = new ConcurrentHashMap<>();
    /** The earliest day already asked for per symbol, so missing early history is not asked for again every night. */
    private final Map<String, LocalDate> triedBackTo = new ConcurrentHashMap<>();

    @Autowired
    public CandleStore(
            CandleSource source,
            PerformanceMapper mapper,
            @Value("${portfolio.performance.heal-days:5}") int healDays) {
        this(source, mapper, healDays, Clock.systemUTC());
    }

    CandleStore(CandleSource source, PerformanceMapper mapper, int healDays, Clock clock) {
        this.source = source;
        this.mapper = mapper;
        this.healDays = Math.max(1, healDays);
        this.clock = clock;
    }

    /** What is stored for {@code symbol} in {@code [from, to]}, oldest first. Never calls the vendor. */
    public List<DailyCandle> read(String symbol, LocalDate from, LocalDate to) {
        return mapper.selectCandles(symbol.toUpperCase(Locale.ROOT), from, to);
    }

    /** Makes sure {@code [from, to]} is covered for {@code symbol}, spending the budget; stops quietly if it cannot. */
    public void ensure(String rawSymbol, LocalDate from, LocalDate to, CandleBudget budget) {
        String symbol = rawSymbol.toUpperCase(Locale.ROOT);
        if (to.isBefore(from)) {
            return;
        }
        Instant now = clock.instant();
        Instant last = attemptedAt.get(symbol);
        if (last != null && Duration.between(last, now).compareTo(MIN_GAP) < 0) {
            return;
        }

        LocalDate first = mapper.selectFirstCandleDate(symbol);
        LocalDate stored = mapper.selectLastCandleDate(symbol);

        List<LocalDate[]> ranges = new ArrayList<>();
        if (first == null) {
            ranges.add(new LocalDate[] {from, to});
        } else {
            if (stored.isBefore(to)) {
                LocalDate healFrom = stored.minusDays(healDays - 1L);
                ranges.add(new LocalDate[] {healFrom.isBefore(first) ? first : healFrom, to});
            }
            LocalDate triedBack = triedBackTo.get(symbol);
            if (from.isBefore(first.minusDays(BACKFILL_SLACK_DAYS)) && (triedBack == null || from.isBefore(triedBack))) {
                ranges.add(new LocalDate[] {from, first.minusDays(1)});
            }
        }
        if (ranges.isEmpty()) {
            return;
        }

        attemptedAt.put(symbol, now);
        for (LocalDate[] range : ranges) {
            if (!budget.tryTake()) {
                attemptedAt.remove(symbol);
                return;
            }
            try {
                List<DailyCandle> candles = source.fetch(symbol, range[0], range[1]);
                for (DailyCandle candle : candles) {
                    mapper.upsertCandle(symbol, candle.date(), candle.close(), candle.adjclose(), candle.currency(), candle.synthetic());
                }
                if (first != null && range[1].isBefore(first)) {
                    triedBackTo.put(symbol, range[0]);
                }
            } catch (CandleSourceException ex) {
                attemptedAt.remove(symbol);
                if (ex.isQuotaExceeded()) {
                    budget.stop();
                }
                LOGGER.warn("Candles for {} could not be fetched ({}); the next run carries on", symbol, ex.getMessage());
                return;
            }
        }
    }
}
