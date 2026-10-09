package org.example.backend.portfolio.service;

import org.example.backend.dto.BalanceResponse;
import org.example.backend.dto.PositionResponse;
import org.example.backend.fx.CurrencyConversionService;
import org.example.backend.fx.ExchangeRateUnavailableException;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.portfolio.dto.PnlResponse;
import org.example.backend.portfolio.dto.PortfolioSummaryResponse;
import org.example.backend.portfolio.dto.PricedPositionResponse;
import org.example.backend.portfolio.dto.RealisedBySymbol;
import org.example.backend.portfolio.dto.RealisedPnlResponse;
import org.example.backend.portfolio.dto.SymbolPnl;
import org.example.backend.portfolio.exceptions.InvalidDateRangeException;
import org.example.backend.portfolio.exceptions.PricingUnavailableException;
import org.example.backend.portfolio.ledger.RealisedPnlLedger;
import org.example.backend.portfolio.ledger.RealisedPnlReconciler;
import org.example.backend.portfolio.model.SymbolRealised;
import org.example.backend.portfolio.quote.ObservedQuote;
import org.example.backend.portfolio.quote.QuoteCache;
import org.example.backend.service.TradeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Builds the three portfolio answers. It <b>reads</b> everything it needs through the code that already owns it
 * (positions and cash through {@link TradeService}, rates through {@link CurrencyConversionService}, quotes through the
 * module's {@link QuoteCache}) and keeps what it owns, the realised-profit-and-loss ledger, in its own table. It writes
 * nothing to the trading tables, and a pricing failure here never reaches the order path.
 *
 * <p><b>Pricing outcomes.</b> Every held instrument priced: a full answer. Some priced: a {@code 200} that omits the price
 * of the others, marks them stale and sets {@code partial}. None priced (and something is held): {@link
 * PricingUnavailableException}, {@code MKT-503}. A position whose price cannot be converted to the account currency counts
 * as not priced; it is never assumed to be 1:1.
 */
@Service
public class PortfolioService {

    private final PortfolioAccess access;
    private final TradeService tradeService;
    private final InstrumentMapper instrumentMapper;
    private final QuoteCache quoteCache;
    private final CurrencyConversionService currencyConversion;
    private final RealisedPnlReconciler reconciler;
    private final RealisedPnlLedger ledger;
    private final Clock clock;

    @Autowired
    public PortfolioService(
            PortfolioAccess access,
            TradeService tradeService,
            InstrumentMapper instrumentMapper,
            QuoteCache quoteCache,
            CurrencyConversionService currencyConversion,
            RealisedPnlReconciler reconciler,
            RealisedPnlLedger ledger) {
        this(access, tradeService, instrumentMapper, quoteCache, currencyConversion, reconciler, ledger, Clock.systemUTC());
    }

    PortfolioService(
            PortfolioAccess access,
            TradeService tradeService,
            InstrumentMapper instrumentMapper,
            QuoteCache quoteCache,
            CurrencyConversionService currencyConversion,
            RealisedPnlReconciler reconciler,
            RealisedPnlLedger ledger,
            Clock clock) {
        this.access = access;
        this.tradeService = tradeService;
        this.instrumentMapper = instrumentMapper;
        this.quoteCache = quoteCache;
        this.currencyConversion = currencyConversion;
        this.reconciler = reconciler;
        this.ledger = ledger;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- the three routes

    public PortfolioSummaryResponse summary(long userId, long accountId) {
        access.require(userId, accountId);

        Valuation valuation = value(accountId, null);
        Totals totals = totals(valuation.positions());
        BigDecimal realised = realised(accountId, null, null);

        return new PortfolioSummaryResponse(
                accountId,
                valuation.baseCurrency(),
                PositionValuation.money(valuation.cash()),
                totals.marketValue(),
                totals.costBasisAll(),
                totals.unrealised(),
                PositionValuation.percent(totals.unrealised(), totals.costBasisPriced()),
                realised,
                PositionValuation.money(valuation.cash().add(totals.marketValue())),
                valuation.positions().size(),
                totals.partial(),
                totals.dayPnl(),
                PositionValuation.percent(totals.dayPnl(), totals.previousCloseValue()),
                totals.asOf() != null ? utc(totals.asOf()) : OffsetDateTime.now(clock));
    }

    public List<PricedPositionResponse> positions(long userId, long accountId, String symbol) {
        access.require(userId, accountId);

        Valuation valuation = value(accountId, symbol);
        List<PricedPositionResponse> rows = new ArrayList<>(valuation.positions().size());
        for (Valued position : valuation.positions()) {
            rows.add(toResponse(accountId, position));
        }
        return rows;
    }

    public PnlResponse pnl(long userId, long accountId, LocalDate from, LocalDate to, boolean bySymbol) {
        access.require(userId, accountId);
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidDateRangeException("'from' must not be later than 'to'");
        }

        Valuation valuation = value(accountId, null);
        Totals totals = totals(valuation.positions());

        OffsetDateTime lower = from == null ? null : from.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime upper = to == null ? null : to.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        BigDecimal realised = realised(accountId, lower, upper);

        List<SymbolPnl> breakdown = bySymbol ? breakdown(accountId, valuation.positions(), lower, upper) : null;

        return new PnlResponse(
                accountId,
                valuation.baseCurrency(),
                from,
                to,
                realised,
                totals.unrealised(),
                PositionValuation.money(realised.add(totals.unrealised())),
                totals.dayPnl(),
                breakdown,
                totals.asOf() != null ? utc(totals.asOf()) : OffsetDateTime.now(clock));
    }

    /**
     * Realised profit and loss alone. It is booked at the moment of each sale and has nothing to do with today's price, so
     * this reads no position and asks for no quote: it still answers when pricing is down, which is exactly when a customer
     * most wants to see what they have already realised.
     */
    public RealisedPnlResponse realised(long userId, long accountId, LocalDate from, LocalDate to, boolean bySymbol) {
        access.require(userId, accountId);
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidDateRangeException("'from' must not be later than 'to'");
        }

        OffsetDateTime lower = from == null ? null : from.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime upper = to == null ? null : to.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        BigDecimal total = realised(accountId, lower, upper);

        List<RealisedBySymbol> breakdown = null;
        if (bySymbol) {
            breakdown = ledger.bySymbol(accountId, lower, upper).stream()
                    .map(row -> new RealisedBySymbol(row.tickerSymbol(), PositionValuation.money(row.realisedPnl())))
                    .toList();
        }
        return new RealisedPnlResponse(
                accountId,
                tradeService.getBalance(accountId).currency(),
                from,
                to,
                total,
                breakdown,
                OffsetDateTime.now(clock));
    }

    // ---------------------------------------------------------------- valuation

    private record Valued(
            long quantity,
            String symbol,
            BigDecimal averageCost,
            BigDecimal costBasis,
            String currency,
            boolean priced,
            BigDecimal lastPrice,
            BigDecimal previousClose,
            BigDecimal marketValue,
            BigDecimal unrealised,
            BigDecimal dayPnl,
            BigDecimal previousCloseValue,
            Instant observedAt,
            boolean stale) {
    }

    private record Valuation(String baseCurrency, BigDecimal cash, List<Valued> positions) {
    }

    private record Totals(
            BigDecimal marketValue,
            BigDecimal costBasisAll,
            BigDecimal costBasisPriced,
            BigDecimal unrealised,
            BigDecimal dayPnl,
            BigDecimal previousCloseValue,
            boolean partial,
            Instant asOf) {
    }

    private Valuation value(long accountId, String symbolFilter) {
        BalanceResponse balance = tradeService.getBalance(accountId);
        String base = balance.currency();

        List<PositionResponse> held = tradeService.getPositions(accountId).stream()
                .filter(p -> p.quantity() != null && p.quantity() > 0)
                .filter(p -> symbolFilter == null || symbolFilter.isBlank() || p.symbol().equalsIgnoreCase(symbolFilter.trim()))
                .toList();

        Map<String, ObservedQuote> quotes = held.isEmpty()
                ? Map.of()
                : quoteCache.lookup(held.stream().map(PositionResponse::symbol).toList());

        List<Valued> valued = new ArrayList<>(held.size());
        for (PositionResponse position : held) {
            valued.add(valueOne(position, base, quotes.get(position.symbol().toUpperCase(Locale.ROOT))));
        }

        if (!valued.isEmpty() && valued.stream().noneMatch(Valued::priced)) {
            throw new PricingUnavailableException();
        }
        return new Valuation(base, balance.cashBalance(), valued);
    }

    private Valued valueOne(PositionResponse position, String base, ObservedQuote observed) {
        long quantity = position.quantity();
        BigDecimal costBasis = PositionValuation.costBasis(quantity, position.averageCost());
        String instrumentCurrency = instrumentCurrency(position.symbol(), base);

        if (observed == null) {
            return unpriced(position, quantity, costBasis, instrumentCurrency);
        }

        String quoteCurrency = observed.quote().currency() != null ? observed.quote().currency() : instrumentCurrency;
        BigDecimal last;
        BigDecimal previous = null;
        try {
            last = currencyConversion.convert(observed.quote().price(), quoteCurrency, base);
            if (observed.quote().previousClose() != null) {
                previous = currencyConversion.convert(observed.quote().previousClose(), quoteCurrency, base);
            }
        } catch (ExchangeRateUnavailableException ex) {
            // One currency that cannot be converted makes this position unpriced, not the whole portfolio unavailable.
            return unpriced(position, quantity, costBasis, quoteCurrency);
        }

        BigDecimal marketValue = PositionValuation.marketValue(quantity, last);
        return new Valued(
                quantity,
                position.symbol(),
                position.averageCost(),
                costBasis,
                quoteCurrency,
                true,
                last.setScale(4, RoundingMode.HALF_UP),
                previous == null ? null : previous.setScale(4, RoundingMode.HALF_UP),
                marketValue,
                PositionValuation.money(marketValue.subtract(costBasis)),
                PositionValuation.dayPnl(quantity, last, previous),
                previous == null ? null : PositionValuation.marketValue(quantity, previous),
                observed.observedAt(),
                observed.stale());
    }

    private static Valued unpriced(PositionResponse position, long quantity, BigDecimal costBasis, String currency) {
        return new Valued(quantity, position.symbol(), position.averageCost(), costBasis, currency,
                false, null, null, null, null, null, null, null, true);
    }

    private String instrumentCurrency(String symbol, String fallback) {
        return instrumentMapper.selectInstrumentByTicker(symbol)
                .map(instrument -> instrument.getCurrency())
                .orElse(fallback);
    }

    private static Totals totals(List<Valued> positions) {
        BigDecimal marketValue = BigDecimal.ZERO;
        BigDecimal costAll = BigDecimal.ZERO;
        BigDecimal costPriced = BigDecimal.ZERO;
        BigDecimal unrealised = BigDecimal.ZERO;
        BigDecimal dayPnl = null;
        BigDecimal previousCloseValue = null;
        boolean partial = false;
        Instant oldest = null;

        for (Valued position : positions) {
            costAll = costAll.add(position.costBasis());
            if (!position.priced()) {
                partial = true;
                continue;
            }
            marketValue = marketValue.add(position.marketValue());
            costPriced = costPriced.add(position.costBasis());
            unrealised = unrealised.add(position.unrealised());
            if (position.dayPnl() != null) {
                dayPnl = (dayPnl == null ? BigDecimal.ZERO : dayPnl).add(position.dayPnl());
                previousCloseValue = (previousCloseValue == null ? BigDecimal.ZERO : previousCloseValue)
                        .add(position.previousCloseValue());
            }
            if (oldest == null || position.observedAt().isBefore(oldest)) {
                oldest = position.observedAt();
            }
        }
        return new Totals(
                PositionValuation.money(marketValue),
                PositionValuation.money(costAll),
                PositionValuation.money(costPriced),
                PositionValuation.money(unrealised),
                dayPnl == null ? null : PositionValuation.money(dayPnl),
                previousCloseValue,
                partial,
                oldest);
    }

    private PricedPositionResponse toResponse(long accountId, Valued position) {
        return new PricedPositionResponse(
                accountId,
                position.symbol(),
                Math.toIntExact(position.quantity()),
                position.averageCost(),
                position.costBasis(),
                position.lastPrice(),
                position.previousClose(),
                position.marketValue(),
                position.unrealised(),
                position.priced() ? PositionValuation.percent(position.unrealised(), position.costBasis()) : null,
                position.dayPnl(),
                position.dayPnl() == null ? null : PositionValuation.percent(position.dayPnl(), position.previousCloseValue()),
                position.currency(),
                position.observedAt() == null ? null : utc(position.observedAt()),
                position.stale());
    }

    // ---------------------------------------------------------------- realised profit and loss

    /** Brings the account's ledger up to date first (a no-op when it already is), then sums it. Never a price. */
    private BigDecimal realised(long accountId, OffsetDateTime from, OffsetDateTime to) {
        reconciler.reconcileAccount(accountId);
        return PositionValuation.money(ledger.total(accountId, from, to));
    }

    private List<SymbolPnl> breakdown(long accountId, List<Valued> positions, OffsetDateTime from, OffsetDateTime to) {
        Map<String, BigDecimal[]> bySymbol = new TreeMap<>(Comparator.naturalOrder());
        for (SymbolRealised row : ledger.bySymbol(accountId, from, to)) {
            bySymbol.computeIfAbsent(row.tickerSymbol(), key -> new BigDecimal[] {PositionValuation.money(BigDecimal.ZERO), PositionValuation.money(BigDecimal.ZERO)})[0] =
                    PositionValuation.money(row.realisedPnl());
        }
        for (Valued position : positions) {
            if (position.priced()) {
                bySymbol.computeIfAbsent(position.symbol(), key -> new BigDecimal[] {PositionValuation.money(BigDecimal.ZERO), PositionValuation.money(BigDecimal.ZERO)})[1] =
                        position.unrealised();
            }
        }
        List<SymbolPnl> rows = new ArrayList<>();
        bySymbol.forEach((symbol, figures) -> rows.add(new SymbolPnl(
                symbol,
                figures[0],
                figures[1],
                PositionValuation.money(figures[0].add(figures[1])))));
        return rows;
    }

    private static OffsetDateTime utc(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}
