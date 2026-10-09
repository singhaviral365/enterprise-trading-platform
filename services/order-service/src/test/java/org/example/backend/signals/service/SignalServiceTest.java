package org.example.backend.signals.service;

import org.example.backend.entities.Account;
import org.example.backend.entities.Holding;
import org.example.backend.entities.Instrument;
import org.example.backend.enums.AccountStatus;
import org.example.backend.enums.InstrumentAssetClass;
import org.example.backend.enums.InstrumentStatus;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.exceptions.InstrumentNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.mapper.HoldingMapper;
import org.example.backend.mapper.InstrumentMapper;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.signals.SignalTestSupport;
import org.example.backend.signals.data.Candle;
import org.example.backend.signals.data.CandleCache;
import org.example.backend.signals.dto.ChatRequest;
import org.example.backend.signals.dto.ChatResponse;
import org.example.backend.signals.dto.ChatTurnDto;
import org.example.backend.signals.dto.SignalResponse;
import org.example.backend.signals.exceptions.AssistantDisabledException;
import org.example.backend.signals.exceptions.InsufficientHistoryException;
import org.example.backend.signals.exceptions.SignalAccessDeniedException;
import org.example.backend.signals.explain.GeminiSignalExplainer;
import org.example.backend.signals.explain.GeminiSignalExplainer.Explanation;
import org.example.backend.signals.explain.GeminiSignalExplainer.Position;
import org.example.backend.signals.explain.GeminiSignalExplainer.Source;
import org.example.backend.signals.indicator.SignalComputer;
import org.example.backend.signals.model.SignalDirection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SignalServiceTest {

    private static final long USER = 7;
    private static final long ACCOUNT = 1001;
    private static final LocalDate END = LocalDate.parse("2026-10-06");

    private CandleCache candles;
    private GeminiSignalExplainer explainer;
    private AccountMapper accounts;
    private InstrumentMapper instruments;
    private HoldingMapper holdings;
    private PreferencesMapper preferences;
    private SignalService service;

    @BeforeEach
    void setUp() {
        candles = mock(CandleCache.class);
        explainer = mock(GeminiSignalExplainer.class);
        accounts = mock(AccountMapper.class);
        instruments = mock(InstrumentMapper.class);
        holdings = mock(HoldingMapper.class);
        preferences = mock(PreferencesMapper.class);

        when(accounts.selectAccountById((int) ACCOUNT)).thenReturn(Optional.of(account()));
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn((int) USER);
        when(instruments.selectInstrumentByTicker("AAPL")).thenReturn(Optional.of(instrument()));
        when(holdings.selectHoldingByAccountAndInstrument(anyInt(), anyInt())).thenReturn(Optional.empty());
        when(preferences.selectByAccountId(ACCOUNT)).thenReturn(Optional.empty());
        when(candles.get(anyString(), anyInt()))
                .thenReturn(new CandleCache.Candles(SignalTestSupport.candles("AAPL", 60, 100, 1, END),
                        SignalTestSupport.NOW.minusSeconds(120), false));

        service = new SignalService(
                candles, new SignalComputer(), explainer, accounts, instruments, holdings, preferences,
                SignalTestSupport.properties(), SignalTestSupport.metrics(), SignalTestSupport.clockAt(SignalTestSupport.NOW));
    }

    private static Account account() {
        return new Account(1001, "ACC000001001", LocalDate.parse("2025-01-01"), new BigDecimal("10000.0000"),
                new BigDecimal("10000.0000"), AccountStatus.ACTIVE, "USD", 1, null, null, 7);
    }

    private static Instrument instrument() {
        return new Instrument(2001, "AAPL", "Apple Inc.", InstrumentAssetClass.EQUITY, InstrumentStatus.TRADING, "USD", null);
    }

    private void assistantSwitched(boolean on) {
        PreferenceRow row = mock(PreferenceRow.class);
        when(row.aiAssistantEnabled()).thenReturn(on);
        when(preferences.selectByAccountId(ACCOUNT)).thenReturn(Optional.of(row));
    }

    @Test
    void theNumericSignalNeedsNoAssistantAndCarriesTheMethodAndTheDisclaimer() {
        SignalResponse response = service.getSignal(USER, ACCOUNT, "aapl", null, false);

        assertEquals("AAPL", response.symbol());
        assertEquals(SignalDirection.BUY, response.direction());
        assertEquals(60, response.sessions());
        assertEquals(120, response.cacheAge());
        assertFalse(response.stale());
        assertNull(response.explanation());
        assertNull(response.explanationSource());
        assertTrue(response.methodology().contains("20-day"));
        assertTrue(response.disclaimer().contains("not investment advice"));
        verify(explainer, never()).explain(anyLong(), anyString(), any(), any());
    }

    @Test
    void theDefaultWindowIsNinetyDays() {
        service.getSignal(USER, ACCOUNT, "AAPL", null, false);

        verify(candles).get("AAPL", 90);
    }

    @Test
    void onlyTheDocumentedWindowsAreAccepted() {
        service.getSignal(USER, ACCOUNT, "AAPL", 365, false);
        verify(candles).get("AAPL", 365);

        assertThrows(IllegalArgumentException.class, () -> service.getSignal(USER, ACCOUNT, "AAPL", 30, false));
        assertThrows(IllegalArgumentException.class, () -> service.getSignal(USER, ACCOUNT, "AAPL", 1000, false));
    }

    @Test
    void anAccountThatIsNotTheTokensUsersIsRefused() {
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn(99);

        SignalAccessDeniedException ex =
                assertThrows(SignalAccessDeniedException.class, () -> service.getSignal(USER, ACCOUNT, "AAPL", null, false));

        assertEquals("ACC-403", ex.getErrorCode());
        verify(candles, never()).get(anyString(), anyInt());
    }

    @Test
    void anUnknownAccountOrInstrumentIsNotFound() {
        when(accounts.selectAccountById(5)).thenReturn(Optional.empty());
        assertThrows(AccountNotFoundException.class, () -> service.getSignal(USER, 5, "AAPL", null, false));

        assertThrows(InstrumentNotFoundException.class, () -> service.getSignal(USER, ACCOUNT, "ZZZZ", null, false));
    }

    @Test
    void syntheticCandlesAreLeftOutSoTheAveragesAreOverRealSessions() {
        List<Candle> mixed = new ArrayList<>(SignalTestSupport.candles("AAPL", 49, 100, 1, END));
        for (int i = 0; i < 20; i++) {
            mixed.add(new Candle(END.plusDays(1 + i), BigDecimal.valueOf(500), true));
        }
        when(candles.get(anyString(), anyInt()))
                .thenReturn(new CandleCache.Candles(mixed, SignalTestSupport.NOW, false));

        // 49 real sessions: not enough, whatever the 20 synthetic rows would have added.
        assertThrows(InsufficientHistoryException.class, () -> service.getSignal(USER, ACCOUNT, "AAPL", null, false));
    }

    @Test
    void candlesAreOrderedByDateWhateverOrderTheyArriveIn() {
        List<Candle> reversed = new ArrayList<>(SignalTestSupport.candles("AAPL", 60, 100, 1, END));
        java.util.Collections.reverse(reversed);
        when(candles.get(anyString(), anyInt()))
                .thenReturn(new CandleCache.Candles(reversed, SignalTestSupport.NOW, false));

        assertEquals(SignalDirection.BUY, service.getSignal(USER, ACCOUNT, "AAPL", null, false).direction());
    }

    @Test
    void aSignalComputedFromStaleCandlesSaysSo() {
        when(candles.get(anyString(), anyInt()))
                .thenReturn(new CandleCache.Candles(SignalTestSupport.candles("AAPL", 60, 100, 1, END), SignalTestSupport.NOW, true));

        assertTrue(service.getSignal(USER, ACCOUNT, "AAPL", null, false).stale());
    }

    @Test
    void theSameSignalWithinItsWindowIsNotComputedFromCandlesAgain() {
        service.getSignal(USER, ACCOUNT, "AAPL", null, false);
        service.getSignal(USER, ACCOUNT, "AAPL", null, false);

        verify(candles, times(1)).get(anyString(), anyInt());
    }

    @Test
    void theNarrativeUsesTheModelOnlyForACustomerWhoSwitchedTheAssistantOn() {
        assistantSwitched(true);
        when(explainer.explain(eq(ACCOUNT), eq("AAPL"), any(), any()))
                .thenReturn(new Explanation("Model words.", Source.GEMINI));

        SignalResponse response = service.getSignal(USER, ACCOUNT, "AAPL", null, true);

        assertEquals("Model words.", response.explanation());
        assertEquals("GEMINI", response.explanationSource());
    }

    @Test
    void theNarrativeForAnyoneElseIsThePlatformsOwnAndNothingIsSentToTheModel() {
        assistantSwitched(false);

        SignalResponse response = service.getSignal(USER, ACCOUNT, "AAPL", null, true);

        assertNotNull(response.explanation());
        assertEquals("FALLBACK", response.explanationSource());
        verify(explainer, never()).explain(anyLong(), anyString(), any(), any());
    }

    @Test
    void theModelIsToldTheCustomersHoldingAndNothingElse() {
        assistantSwitched(true);
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(4001, 50, new BigDecimal("175.5000"), 1001, 2001)));
        when(explainer.explain(anyLong(), anyString(), any(), any())).thenReturn(new Explanation("x", Source.GEMINI));

        service.getSignal(USER, ACCOUNT, "AAPL", null, true);

        ArgumentCaptor<Position> position = ArgumentCaptor.forClass(Position.class);
        verify(explainer).explain(eq(ACCOUNT), eq("AAPL"), any(), position.capture());
        assertEquals(50, position.getValue().quantity());
        assertEquals(0, new BigDecimal("175.5000").compareTo(position.getValue().averageCost()));
        assertEquals("USD", position.getValue().currency());
    }

    @Test
    void aSoldOutHoldingCountsAsNoHolding() {
        assistantSwitched(true);
        when(holdings.selectHoldingByAccountAndInstrument(1001, 2001))
                .thenReturn(Optional.of(new Holding(4001, 0, new BigDecimal("175.5000"), 1001, 2001)));
        when(explainer.explain(anyLong(), anyString(), any(), any())).thenReturn(new Explanation("x", Source.GEMINI));

        service.getSignal(USER, ACCOUNT, "AAPL", null, true);

        ArgumentCaptor<Position> position = ArgumentCaptor.forClass(Position.class);
        verify(explainer).explain(eq(ACCOUNT), eq("AAPL"), any(), position.capture());
        assertEquals(0, position.getValue().quantity());
    }

    @Test
    void theChatIsRefusedUnlessTheAssistantIsOn() {
        assistantSwitched(false);

        AssistantDisabledException ex = assertThrows(AssistantDisabledException.class,
                () -> service.chat(USER, new ChatRequest(ACCOUNT, "AAPL", "Why?", List.of())));

        assertEquals("AST-403", ex.getErrorCode());
        verify(explainer, never()).chat(anyLong(), anyString(), any(), any(), any(), anyString());
    }

    @Test
    void theChatIsRefusedWhenTheCustomerHasNeverSavedSettings() {
        assertThrows(AssistantDisabledException.class,
                () -> service.chat(USER, new ChatRequest(ACCOUNT, "AAPL", "Why?", null)));
    }

    @Test
    void theChatChecksOwnershipBeforeAnythingElse() {
        when(accounts.selectAccountLinkedUserId((int) ACCOUNT)).thenReturn(99);

        assertThrows(SignalAccessDeniedException.class,
                () -> service.chat(USER, new ChatRequest(ACCOUNT, "AAPL", "Why?", List.of())));
        verify(preferences, never()).selectByAccountId(anyLong());
    }

    @Test
    void theChatPassesTheHistoryAndAnswersWithAFreshSignal() {
        assistantSwitched(true);
        when(explainer.chat(eq(ACCOUNT), eq("AAPL"), any(), any(), any(), eq("And the RSI?")))
                .thenReturn(new Explanation("It is in the middle range.", Source.GEMINI));

        ChatResponse response = service.chat(USER, new ChatRequest(ACCOUNT, "AAPL", "And the RSI?",
                List.of(new ChatTurnDto("user", "Why?"), new ChatTurnDto("assistant", "Because."))));

        assertEquals("It is in the middle range.", response.response());
        assertEquals("GEMINI", response.source());
        assertEquals(SignalDirection.BUY, response.signal().direction());
        assertNull(response.signal().explanation(), "the answer carries the signal's numbers, not a second explanation");
        assertEquals(OffsetDateTime.parse("2026-10-07T10:00:00Z"), response.timestamp());

        ArgumentCaptor<List<GeminiSignalExplainer.Exchange>> history = ArgumentCaptor.forClass(List.class);
        verify(explainer).chat(eq(ACCOUNT), eq("AAPL"), any(), any(), history.capture(), eq("And the RSI?"));
        assertEquals(2, history.getValue().size());
        assertEquals("assistant", history.getValue().get(1).role());
    }
}
