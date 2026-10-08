package org.example.backend.signals.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.signals.config.SignalProperties;
import org.example.backend.signals.data.Candle;
import org.example.backend.signals.data.CandleCache;
import org.example.backend.signals.dto.ChatRequest;
import org.example.backend.signals.dto.ChatResponse;
import org.example.backend.signals.dto.ChatTurnDto;
import org.example.backend.signals.dto.SignalResponse;
import org.example.backend.signals.exceptions.AssistantDisabledException;
import org.example.backend.signals.exceptions.SignalAccessDeniedException;
import org.example.backend.signals.explain.FallbackExplanations;
import org.example.backend.signals.explain.GeminiSignalExplainer;
import org.example.backend.signals.explain.GeminiSignalExplainer.Exchange;
import org.example.backend.signals.explain.GeminiSignalExplainer.Explanation;
import org.example.backend.signals.explain.GeminiSignalExplainer.Position;
import org.example.backend.signals.indicator.SignalComputer;
import org.example.backend.signals.model.TradeSignal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Trade signals and the assistant that explains them. It reads prices and the customer's own holding, writes nothing, and
 * places no order: a signal is information, and what is done about it goes through the ordinary order route.
 *
 * <p><b>Who may ask.</b> Every call starts by checking the token's user owns the account. The signal itself (numbers only)
 * is available to any owner; the language model is only used for a customer who switched the AI assistant on in
 * Settings. For anybody else the same screen gets the platform's own wording, and nothing about them leaves the platform.
 */
@Service
public class SignalService {

    /** The calendar days of history a signal may be computed from. 90 is the default; the others cost one more fetch each. */
    static final Set<Integer> LOOKBACKS = Set.of(90, 180, 365);

    private final CandleCache candles;
    private final SignalComputer computer;
    private final GeminiSignalExplainer explainer;
    private final AccountMapper accounts;
    private final InstrumentMapper instruments;
    private final HoldingMapper holdings;
    private final PreferencesMapper preferences;
    private final SignalProperties properties;
    private final SignalMetrics metrics;
    private final Clock clock;
    private final Map<String, Computed> results = new ConcurrentHashMap<>();

    private record Computed(TradeSignal signal, Instant fetchedAt, boolean stale, Instant computedAt) {
    }

    @Autowired
    public SignalService(
            CandleCache candles,
            SignalComputer computer,
            GeminiSignalExplainer explainer,
            AccountMapper accounts,
            InstrumentMapper instruments,
            HoldingMapper holdings,
            PreferencesMapper preferences,
            SignalProperties properties,
            SignalMetrics metrics) {
        this(candles, computer, explainer, accounts, instruments, holdings, preferences, properties, metrics,
                Clock.systemUTC());
    }

    SignalService(
            CandleCache candles,
            SignalComputer computer,
            GeminiSignalExplainer explainer,
            AccountMapper accounts,
            InstrumentMapper instruments,
            HoldingMapper holdings,
            PreferencesMapper preferences,
            SignalProperties properties,
            SignalMetrics metrics,
            Clock clock) {
        this.candles = candles;
        this.computer = computer;
        this.explainer = explainer;
        this.accounts = accounts;
        this.instruments = instruments;
        this.holdings = holdings;
        this.preferences = preferences;
        this.properties = properties;
        this.metrics = metrics;
        this.clock = clock;
    }

    /**
     * @param lookbackDays calendar days of history, or null for the default; one of 90, 180 or 365
     * @param narrative    whether to include the explanation
     */
    public SignalResponse getSignal(long userId, long accountId, String symbol, Integer lookbackDays, boolean narrative) {
        Account account = requireAccount(userId, accountId);
        Instrument instrument = requireInstrument(symbol);
        Computed computed = signalFor(instrument.getInstrumentTicker(), lookback(lookbackDays));

        Explanation explanation = null;
        if (narrative) {
            Position position = positionOf(account, instrument);
            explanation = assistantEnabled(accountId)
                    ? explainer.explain(accountId, instrument.getInstrumentTicker(), computed.signal(), position)
                    : new Explanation(FallbackExplanations.explain(computed.signal()), GeminiSignalExplainer.Source.FALLBACK);
        }
        return response(instrument.getInstrumentTicker(), computed, explanation);
    }

    /**
     * Answers one question. Each turn computes the signal afresh (from the cache, so it costs nothing within its window), so
     * the answer is never about a signal the screen is no longer showing.
     *
     * @throws AssistantDisabledException when the customer has not switched the assistant on
     */
    public ChatResponse chat(long userId, ChatRequest request) {
        long accountId = request.accountId();
        Account account = requireAccount(userId, accountId);
        if (!assistantEnabled(accountId)) {
            throw new AssistantDisabledException();
        }
        Instrument instrument = requireInstrument(request.symbol());
        Computed computed = signalFor(instrument.getInstrumentTicker(), properties.defaultLookbackDays());

        List<Exchange> history = request.conversationHistory() == null ? List.of()
                : request.conversationHistory().stream().map(SignalService::exchange).toList();

        Explanation answer = explainer.chat(
                accountId, instrument.getInstrumentTicker(), computed.signal(), positionOf(account, instrument),
                history, request.message());

        return new ChatResponse(
                answer.text(),
                answer.source().name(),
                response(instrument.getInstrumentTicker(), computed, null),
                OffsetDateTime.now(clock));
    }

    private Computed signalFor(String ticker, int lookbackDays) {
        String key = ticker.toUpperCase(Locale.ROOT) + "|" + lookbackDays;
        Instant now = clock.instant();

        Computed held = results.get(key);
        if (held != null && Duration.between(held.computedAt(), now).compareTo(properties.signalTtl()) < 0) {
            metrics.resultCache("hit");
            return held;
        }
        metrics.resultCache("miss");

        CandleCache.Candles fetched = candles.get(ticker, lookbackDays);
        // A synthetic candle bridges a day the market was closed. It is not a trading day, and counting it would make
        // "20 days" mean something different from "20 sessions", so the averages are taken over real sessions only.
        List<Candle> sessions = fetched.candles().stream()
                .filter(candle -> !candle.synthetic())
                .sorted(Comparator.comparing(Candle::date))
                .toList();

        List<BigDecimal> closes = sessions.stream().map(Candle::close).toList();
        LocalDate asOf = sessions.isEmpty() ? null : sessions.get(sessions.size() - 1).date();
        TradeSignal signal = computer.compute(closes, asOf);

        Computed computed = new Computed(signal, fetched.fetchedAt(), fetched.stale(), now);
        results.put(key, computed);
        return computed;
    }

    private SignalResponse response(String ticker, Computed computed, Explanation explanation) {
        Instant now = clock.instant();
        TradeSignal signal = computed.signal();
        return new SignalResponse(
                ticker,
                signal.direction(),
                signal.strength(),
                signal.smaStatus(),
                signal.sma20(),
                signal.sma50(),
                signal.price(),
                signal.rsi(),
                signal.asOf(),
                signal.sessions(),
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC),
                Math.max(0, Duration.between(computed.fetchedAt(), now).toSeconds()),
                computed.stale(),
                explanation == null ? null : explanation.text(),
                explanation == null ? null : explanation.source().name(),
                SignalResponse.METHODOLOGY,
                SignalResponse.DISCLAIMER);
    }

    private int lookback(Integer requested) {
        if (requested == null) {
            return properties.defaultLookbackDays();
        }
        if (!LOOKBACKS.contains(requested)) {
            throw new IllegalArgumentException("lookbackPeriods must be one of 90, 180 or 365");
        }
        return requested;
    }

    private Account requireAccount(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);
        Account account = accounts.selectAccountById(accountIdInt)
                .orElseThrow(() -> new AccountNotFoundException(accountId));

        Integer linkedUserId = accounts.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new SignalAccessDeniedException(accountId);
        }
        return account;
    }

    private Instrument requireInstrument(String symbol) {
        String ticker = symbol.trim().toUpperCase(Locale.ROOT);
        return instruments.selectInstrumentByTicker(ticker).orElseThrow(() -> new InstrumentNotFoundException(ticker));
    }

    /** What the customer holds of this instrument, and nothing else about them. */
    private Position positionOf(Account account, Instrument instrument) {
        Optional<Holding> holding = holdings.selectHoldingByAccountAndInstrument(
                account.getAccountId(), instrument.getInstrumentId());
        return holding.filter(h -> h.getQuantity() > 0)
                .map(h -> new Position(h.getQuantity(), h.getPurchasePrice(), account.getCurrency()))
                .orElse(Position.NONE);
    }

    private boolean assistantEnabled(long accountId) {
        return preferences.selectByAccountId(accountId).map(PreferenceRow::aiAssistantEnabled).orElse(false);
    }

    private static Exchange exchange(ChatTurnDto turn) {
        return new Exchange(turn.role(), turn.content());
    }
}
