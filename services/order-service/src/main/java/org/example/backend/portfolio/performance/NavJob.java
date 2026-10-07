package org.example.backend.portfolio.performance;

import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Keeps the end-of-day statements up to date. It runs nightly (UTC, after the last close) over every account that can have a
 * history, and it can build one account's history on demand (the first time someone opens the performance view), in the
 * background and one at a time per account.
 *
 * <p><b>Contained.</b> It has its own thread, catches everything per account, and stops for the night on the first quota error.
 * A candle outage or one bad day of data can slow or empty the performance view; it cannot touch the portfolio routes or
 * trading. {@code portfolio.performance.enabled=false} switches it off altogether.
 */
@Component
public class NavJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(NavJob.class);

    /** A history that came out empty is not built again on every request: at most once in this long. */
    private static final Duration RETRY_AFTER = Duration.ofHours(1);
    /** How far back the benchmark is kept. */
    private static final int BENCHMARK_DAYS = 1825;

    private final EodStatementService statements;
    private final PerformanceMapper mapper;
    private final CandleStore candles;
    private final boolean enabled;
    private final int maxCalls;
    private final List<String> benchmarks;
    private final Clock clock;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "portfolio-history-builder");
        thread.setDaemon(true);
        return thread;
    });
    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();
    private final Map<Long, Instant> lastAttempt = new ConcurrentHashMap<>();

    @Autowired
    public NavJob(
            EodStatementService statements,
            PerformanceMapper mapper,
            CandleStore candles,
            @Value("${portfolio.performance.enabled:true}") boolean enabled,
            @Value("${portfolio.performance.max-candle-calls-per-run:60}") int maxCalls,
            @Value("${portfolio.performance.benchmarks:SPY}") String benchmarks) {
        this(statements, mapper, candles, enabled, maxCalls, parse(benchmarks), Clock.systemUTC());
    }

    NavJob(EodStatementService statements, PerformanceMapper mapper, CandleStore candles, boolean enabled, int maxCalls,
           List<String> benchmarks, Clock clock) {
        this.statements = statements;
        this.mapper = mapper;
        this.candles = candles;
        this.enabled = enabled;
        this.maxCalls = maxCalls;
        this.benchmarks = benchmarks;
        this.clock = clock;
    }

    static List<String> parse(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(",")).map(String::trim).filter(value -> !value.isEmpty()).map(String::toUpperCase).toList();
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** The symbols a benchmark may be chosen from. */
    public List<String> benchmarks() {
        return benchmarks;
    }

    @Scheduled(cron = "${portfolio.performance.cron:0 30 1 * * *}", zone = "UTC")
    public void nightly() {
        if (!enabled) {
            return;
        }
        try {
            int written = runAll();
            LOGGER.info("Portfolio history updated: {} statement(s) written", written);
        } catch (RuntimeException ex) {
            LOGGER.warn("The nightly portfolio history run failed; it will try again tomorrow", ex);
        }
    }

    /** One pass over every account, within the call budget. @return how many statements were written */
    public int runAll() {
        CandleBudget budget = new CandleBudget(maxCalls);
        LocalDate end = LocalDate.now(clock).minusDays(1);
        for (String benchmark : benchmarks) {
            candles.ensure(benchmark, end.minusDays(BENCHMARK_DAYS), end, budget);
        }

        int written = 0;
        for (Long accountId : mapper.selectBuildableAccountIds()) {
            if (budget.isStopped()) {
                LOGGER.info("Portfolio history: the candle budget or quota is spent for this run; the rest resumes next run");
                break;
            }
            try {
                written += statements.build(accountId, budget);
            } catch (RuntimeException ex) {
                LOGGER.warn("Portfolio history for account {} failed", accountId, ex);
            }
        }
        return written;
    }

    /**
     * Builds one account's history in the background. Returns true if a build is running for it (just started or already under
     * way), false if one finished recently without producing anything, so a request does not start another on every refresh.
     */
    public boolean buildInBackground(long accountId) {
        if (!enabled) {
            return false;
        }
        if (inFlight.contains(accountId)) {
            return true;
        }
        Instant last = lastAttempt.get(accountId);
        if (last != null && Duration.between(last, clock.instant()).compareTo(RETRY_AFTER) < 0) {
            return false;
        }
        if (!inFlight.add(accountId)) {
            return true;
        }
        lastAttempt.put(accountId, clock.instant());
        executor.submit(() -> {
            try {
                statements.build(accountId, new CandleBudget(maxCalls));
            } catch (RuntimeException ex) {
                LOGGER.warn("Portfolio history for account {} could not be built", accountId, ex);
            } finally {
                inFlight.remove(accountId);
            }
        });
        return true;
    }

    public boolean isBuilding(long accountId) {
        return inFlight.contains(accountId);
    }
}
