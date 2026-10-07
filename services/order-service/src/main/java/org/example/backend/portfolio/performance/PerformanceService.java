package org.example.backend.portfolio.performance;

import org.example.backend.mapper.AccountMapper;
import org.example.backend.portfolio.dto.BenchmarkPoint;
import org.example.backend.portfolio.dto.BenchmarkSeries;
import org.example.backend.portfolio.dto.NavPoint;
import org.example.backend.portfolio.dto.PerformanceResponse;
import org.example.backend.portfolio.dto.PerformanceSummary;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PerformanceDisabledException;
import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.example.backend.portfolio.service.PortfolioAccess;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Reads the stored history. It never calls the market data vendor and never computes anything from a live quote: what it
 * answers was written for closed days by {@link EodStatementService}. The first time an account is asked for, the history is
 * built in the background and the answer is "building" (an empty {@code Optional}); the caller asks again shortly.
 *
 * <p>Every call starts with the ownership check, exactly like the portfolio routes.
 */
@Service
public class PerformanceService {

    private static final BigDecimal START = NavCalculator.START_NAV;

    private final PortfolioAccess access;
    private final PerformanceMapper mapper;
    private final CandleStore candles;
    private final NavJob job;
    private final AccountMapper accountMapper;

    public PerformanceService(PortfolioAccess access, PerformanceMapper mapper, CandleStore candles, NavJob job, AccountMapper accountMapper) {
        this.access = access;
        this.mapper = mapper;
        this.candles = candles;
        this.job = job;
        this.accountMapper = accountMapper;
    }

    /**
     * @param benchmark a symbol from the configured list, or null for none
     * @return the history, or empty while it is being built for the first time
     */
    public Optional<PerformanceResponse> curve(long userId, long accountId, LocalDate from, LocalDate to, String benchmark) {
        access.require(userId, accountId);
        if (!job.isEnabled()) {
            throw new PerformanceDisabledException();
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidDateRangeException("'from' must not be later than 'to'");
        }
        String benchmarkSymbol = benchmark == null || benchmark.isBlank() ? null : benchmark.trim().toUpperCase(Locale.ROOT);
        if (benchmarkSymbol != null && !job.benchmarks().contains(benchmarkSymbol)) {
            throw new InvalidDateRangeException("Unknown benchmark");
        }

        List<NavRow> all = mapper.selectNav(accountId, null, null);
        if (all.isEmpty() && job.buildInBackground(accountId)) {
            return Optional.empty();
        }

        List<NavRow> rows = all.stream()
                .filter(row -> from == null || !row.date().isBefore(from))
                .filter(row -> to == null || !row.date().isAfter(to))
                .toList();

        String currency = accountMapper.selectAccountById(Math.toIntExact(accountId))
                .map(account -> account.getCurrency()).orElse("USD");
        LocalDate availableFrom = all.isEmpty() ? null : all.get(0).date();

        PerformanceSummary summary = rows.isEmpty() ? null : PerformanceMath.summarise(rows);
        List<NavPoint> points = rows.stream().map(PerformanceService::point).toList();
        boolean estimated = rows.stream().anyMatch(NavRow::estimated);

        BenchmarkSeries series = rows.isEmpty() || benchmarkSymbol == null ? null : benchmark(benchmarkSymbol, rows);
        return Optional.of(new PerformanceResponse(accountId, currency, estimated, availableFrom, summary, points, series));
    }

    private static NavPoint point(NavRow row) {
        return new NavPoint(row.date(), row.nav(), row.totalValue(), row.netFlow(), row.dayPnl(), row.unrealisedPnl(),
                row.realisedPnlCumulative(), row.estimated());
    }

    /** The benchmark's adjusted closes over the same days, rebased so the first one is 1000 like the portfolio. Null if none are stored. */
    private BenchmarkSeries benchmark(String symbol, List<NavRow> rows) {
        List<DailyCandle> stored = candles.read(symbol, rows.get(0).date(), rows.get(rows.size() - 1).date());
        if (stored.isEmpty()) {
            return null;
        }
        BigDecimal base = stored.get(0).adjclose();
        List<BenchmarkPoint> points = stored.stream()
                .map(candle -> new BenchmarkPoint(
                        candle.date(),
                        START.multiply(candle.adjclose()).divide(base, 6, RoundingMode.HALF_UP)))
                .toList();
        return new BenchmarkSeries(symbol, points);
    }
}
