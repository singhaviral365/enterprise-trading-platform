package org.example.backend.portfolio.performance;

import org.example.backend.entities.Account;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.OrderSide;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.fx.ExchangeRateUnavailableException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.portfolio.ledger.AverageCostLot;
import org.example.backend.portfolio.ledger.AverageCostReplay;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.example.backend.portfolio.mapper.PerformanceMapper;
import org.example.backend.portfolio.mapper.PortfolioMapper;
import org.example.backend.portfolio.model.FilledOrder;
import org.example.backend.portfolio.model.HoldingSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Writes the end-of-day statement of every closed day of an account, from the account's own orders and the daily closes in
 * {@link CandleStore}. It never looks at today: only days that have closed, so what is written does not change (apart from the
 * last few days, which are rewritten so that a synthetic candle that Fauxnance later replaces heals itself).
 *
 * <p><b>Starting point.</b> The platform has no deposits, so cash only moves by trades after the opening balance. The opening
 * cash is therefore derived, exactly: {@code balance now - sells + buys}. Anything held that the orders do not explain (a seeded
 * holding) is an opening position, found the same way the realised-profit ledger finds it. The first day's whole value is the
 * funding, and the NAV starts at 1000 there.
 *
 * <p><b>Valuing a day.</b> Each holding is valued at that day's raw {@code close} (share counts are never restated), filled
 * forward over weekends and holidays, and converted to the account currency with that day's exchange-rate candle when the
 * instrument is quoted in another currency. A day is marked <i>estimated</i> when a price was synthetic, missing, filled forward
 * over more than a long weekend, or an exchange rate had to be today's. A holding with no price at all is carried at cost.
 *
 * <p>It reads the trading tables and writes only the performance tables; it holds no transaction open on the shared connection.
 */
@Service
public class EodStatementService {

    private static final Logger LOGGER = LoggerFactory.getLogger(EodStatementService.class);

    /** A close older than this many days is a gap, not a weekend or a holiday. */
    static final int LONG_GAP_DAYS = 5;

    private final AccountMapper accountMapper;
    private final PortfolioMapper portfolioMapper;
    private final PerformanceMapper performanceMapper;
    private final InstrumentMapper instrumentMapper;
    private final CandleStore candles;
    private final RealisedPnlReconciler reconciler;
    private final CurrencyConversionService currencyConversion;
    private final int healDays;
    private final Clock clock;

    @Autowired
    public EodStatementService(
            AccountMapper accountMapper,
            PortfolioMapper portfolioMapper,
            PerformanceMapper performanceMapper,
            InstrumentMapper instrumentMapper,
            CandleStore candles,
            RealisedPnlReconciler reconciler,
            CurrencyConversionService currencyConversion,
            @Value("${portfolio.performance.heal-days:5}") int healDays) {
        this(accountMapper, portfolioMapper, performanceMapper, instrumentMapper, candles, reconciler, currencyConversion,
                healDays, Clock.systemUTC());
    }

    EodStatementService(
            AccountMapper accountMapper,
            PortfolioMapper portfolioMapper,
            PerformanceMapper performanceMapper,
            InstrumentMapper instrumentMapper,
            CandleStore candles,
            RealisedPnlReconciler reconciler,
            CurrencyConversionService currencyConversion,
            int healDays,
            Clock clock) {
        this.accountMapper = accountMapper;
        this.portfolioMapper = portfolioMapper;
        this.performanceMapper = performanceMapper;
        this.instrumentMapper = instrumentMapper;
        this.candles = candles;
        this.reconciler = reconciler;
        this.currencyConversion = currencyConversion;
        this.healDays = Math.max(1, healDays);
        this.clock = clock;
    }

    /** @return how many daily statements were written (new days, plus the recent days that were rewritten) */
    public int build(long accountId, CandleBudget budget) {
        Account account = accountMapper.selectAccountById(Math.toIntExact(accountId)).orElse(null);
        if (account == null || account.getAccountStatus() == AccountStatus.CLOSED) {
            return 0;
        }

        LocalDate end = LocalDate.now(clock).minusDays(1);
        LocalDate start = account.getOpeningDate();
        if (end.isBefore(start)) {
            return 0;
        }
        String base = account.getCurrency();

        // Bring the ledger up to date so the cumulative realised figure on each day is complete.
        reconciler.reconcileAccount(accountId);

        List<FilledOrder> fills = portfolioMapper.selectFilledOrders(accountId);
        Map<String, HoldingSnapshot> holdings = new HashMap<>();
        for (HoldingSnapshot holding : portfolioMapper.selectHoldings(accountId)) {
            holdings.put(holding.tickerSymbol().toUpperCase(Locale.ROOT), holding);
        }

        BigDecimal startCash = startingCash(account, fills);
        if (startCash.signum() < 0) {
            LOGGER.warn("Account {}: the orders imply a negative opening balance, so no history is built for it", accountId);
            return 0;
        }

        Map<String, AverageCostLot> opening = openingPositions(fills, holdings);
        List<HistoryReplay.DayState> states = HistoryReplay.replay(start, end, startCash, opening, fills);

        Map<String, LocalDate> firstHeld = new TreeMap<>();
        for (HistoryReplay.DayState state : states) {
            for (String symbol : state.lots().keySet()) {
                firstHeld.putIfAbsent(symbol, state.date());
            }
        }

        Map<String, String> currencyOf = new HashMap<>();
        for (String symbol : firstHeld.keySet()) {
            currencyOf.put(symbol, currencyOf(symbol, base));
        }

        Prices prices = new Prices(base);
        for (Map.Entry<String, LocalDate> held : firstHeld.entrySet()) {
            candles.ensure(held.getKey(), held.getValue(), end, budget);
            prices.books.put(held.getKey(), book(held.getKey(), held.getValue(), end));
        }
        Map<String, LocalDate> fxFrom = new TreeMap<>();
        firstHeld.forEach((symbol, date) -> {
            String currency = currencyOf.get(symbol);
            if (!currency.equals(base)) {
                fxFrom.merge(currency, date, (a, b) -> a.isBefore(b) ? a : b);
            }
        });
        for (Map.Entry<String, LocalDate> pair : fxFrom.entrySet()) {
            String direct = "FX:" + pair.getKey() + base;
            candles.ensure(direct, pair.getValue(), end, budget);
            prices.books.put(direct, book(direct, pair.getValue(), end));
            if (prices.books.get(direct).isEmpty()) {
                String inverse = "FX:" + base + pair.getKey();
                candles.ensure(inverse, pair.getValue(), end, budget);
                prices.books.put(inverse, book(inverse, pair.getValue(), end));
            }
        }

        Map<LocalDate, BigDecimal> realisedByDay = new TreeMap<>();
        for (DayRealised day : performanceMapper.selectRealisedByDay(accountId)) {
            realisedByDay.put(day.day(), day.realisedPnl());
        }

        List<NavCalculator.DayValue> days = new ArrayList<>(states.size());
        BigDecimal realisedSoFar = BigDecimal.ZERO;
        for (HistoryReplay.DayState state : states) {
            BigDecimal realisedToday = realisedByDay.get(state.date());
            if (realisedToday != null) {
                realisedSoFar = realisedSoFar.add(realisedToday);
            }
            days.add(value(state, currencyOf, prices, realisedSoFar));
        }

        return write(accountId, NavCalculator.compute(days));
    }

    // ---------------------------------------------------------------- the starting point

    /** Cash before the first order: the balance now, with every filled sale taken back out and every filled buy put back. */
    static BigDecimal startingCash(Account account, List<FilledOrder> fills) {
        BigDecimal cash = account.getBalance();
        for (FilledOrder order : fills) {
            BigDecimal value = order.price().multiply(BigDecimal.valueOf(order.quantity()));
            cash = order.side() == OrderSide.SELL ? cash.subtract(value) : cash.add(value);
        }
        return cash.setScale(4, RoundingMode.HALF_UP);
    }

    private static Map<String, AverageCostLot> openingPositions(List<FilledOrder> fills, Map<String, HoldingSnapshot> holdings) {
        Map<String, List<FilledOrder>> bySymbol = fills.stream()
                .collect(Collectors.groupingBy(FilledOrder::tickerSymbol, LinkedHashMap::new, Collectors.toList()));
        Set<String> symbols = new HashSet<>(bySymbol.keySet());
        holdings.forEach((symbol, holding) -> symbols.add(holding.tickerSymbol()));

        Map<String, AverageCostLot> opening = new HashMap<>();
        for (String symbol : symbols) {
            HoldingSnapshot holding = holdings.get(symbol.toUpperCase(Locale.ROOT));
            if (holding == null) {
                continue;
            }
            AverageCostReplay.Opening derived = AverageCostReplay.deriveOpening(bySymbol.getOrDefault(symbol, List.of()), holding);
            if (derived.quantity() > 0) {
                opening.put(symbol, new AverageCostLot(derived.quantity(), derived.averageCost()));
            }
        }
        return opening;
    }

    // ---------------------------------------------------------------- valuing a day

    private final class Prices {
        final String base;
        final Map<String, TreeMap<LocalDate, DailyCandle>> books = new HashMap<>();
        final Map<String, Optional<BigDecimal>> todaysRates = new HashMap<>();

        Prices(String base) {
            this.base = base;
        }
    }

    private record Rate(BigDecimal value, boolean estimated) {
    }

    private NavCalculator.DayValue value(
            HistoryReplay.DayState state, Map<String, String> currencyOf, Prices prices, BigDecimal realisedSoFar) {
        BigDecimal holdingsValue = BigDecimal.ZERO;
        BigDecimal costBasis = BigDecimal.ZERO;
        boolean estimated = false;

        for (Map.Entry<String, AverageCostLot> entry : state.lots().entrySet()) {
            String symbol = entry.getKey();
            AverageCostLot lot = entry.getValue();
            costBasis = costBasis.add(lot.costBasis());

            Map.Entry<LocalDate, DailyCandle> close = prices.books.getOrDefault(symbol, new TreeMap<>()).floorEntry(state.date());
            if (close == null) {
                holdingsValue = holdingsValue.add(lot.costBasis());
                estimated = true;
                continue;
            }
            DailyCandle candle = close.getValue();
            if (candle.synthetic() || ChronoUnit.DAYS.between(candle.date(), state.date()) > LONG_GAP_DAYS) {
                estimated = true;
            }

            Rate rate = rate(currencyOf.get(symbol), prices.base, state.date(), prices);
            if (rate == null) {
                holdingsValue = holdingsValue.add(lot.costBasis());
                estimated = true;
                continue;
            }
            estimated |= rate.estimated();
            holdingsValue = holdingsValue.add(
                    candle.close().multiply(BigDecimal.valueOf(lot.quantity())).multiply(rate.value()));
        }
        return new NavCalculator.DayValue(
                state.date(), state.cash(), holdingsValue.setScale(4, RoundingMode.HALF_UP), costBasis, realisedSoFar,
                BigDecimal.ZERO, estimated);
    }

    /** The rate from one currency to another on a day: that day's candle (direct or inverted), else today's rate, else none. */
    private Rate rate(String from, String to, LocalDate day, Prices prices) {
        if (from.equals(to)) {
            return new Rate(BigDecimal.ONE, false);
        }
        Rate direct = candleRate("FX:" + from + to, false, day, prices);
        if (direct != null) {
            return direct;
        }
        Rate inverse = candleRate("FX:" + to + from, true, day, prices);
        if (inverse != null) {
            return inverse;
        }
        Optional<BigDecimal> today = prices.todaysRates.computeIfAbsent(from + to, key -> {
            try {
                return Optional.of(currencyConversion.convert(BigDecimal.ONE, from, to));
            } catch (ExchangeRateUnavailableException ex) {
                return Optional.empty();
            }
        });
        return today.map(value -> new Rate(value, true)).orElse(null);
    }

    private static Rate candleRate(String symbol, boolean invert, LocalDate day, Prices prices) {
        TreeMap<LocalDate, DailyCandle> book = prices.books.get(symbol);
        Map.Entry<LocalDate, DailyCandle> close = book == null ? null : book.floorEntry(day);
        if (close == null) {
            return null;
        }
        BigDecimal value = invert
                ? BigDecimal.ONE.divide(close.getValue().close(), 12, RoundingMode.HALF_UP)
                : close.getValue().close();
        boolean estimated = close.getValue().synthetic() || ChronoUnit.DAYS.between(close.getKey(), day) > LONG_GAP_DAYS;
        return new Rate(value, estimated);
    }

    private TreeMap<LocalDate, DailyCandle> book(String symbol, LocalDate from, LocalDate to) {
        TreeMap<LocalDate, DailyCandle> book = new TreeMap<>();
        // A few days before the first holding day, so a day that falls on a weekend has a close to fill forward from.
        for (DailyCandle candle : candles.read(symbol, from.minusDays(10), to)) {
            book.put(candle.date(), candle);
        }
        return book;
    }

    private String currencyOf(String symbol, String fallback) {
        return instrumentMapper.selectInstrumentByTicker(symbol).map(Instrument::getCurrency).orElse(fallback);
    }

    // ---------------------------------------------------------------- writing

    /** New days are written; days already written are left alone, except the last few, which are rewritten (healing). */
    private int write(long accountId, List<NavRow> rows) {
        Set<LocalDate> stored = new HashSet<>();
        for (NavRow row : performanceMapper.selectNav(accountId, null, null)) {
            stored.add(row.date());
        }
        LocalDate lastStored = performanceMapper.selectLastNavDate(accountId);
        LocalDate healFrom = lastStored == null ? null : lastStored.minusDays(healDays - 1L);

        int written = 0;
        for (NavRow row : rows) {
            boolean isNew = !stored.contains(row.date());
            boolean recent = healFrom != null && !row.date().isBefore(healFrom);
            if (isNew || recent) {
                performanceMapper.upsertNav(
                        accountId, row.date(), row.cash(), row.holdingsValue(), row.totalValue(), row.costBasis(),
                        row.unrealisedPnl(), row.realisedPnlCumulative(), row.netFlow(), row.dayPnl(), row.units(),
                        row.nav(), row.estimated());
                written++;
            }
        }
        return written;
    }
}
