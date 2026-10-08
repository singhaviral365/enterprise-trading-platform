package org.example.backend.preferences.service;

import org.example.backend.entities.Account;
import org.example.backend.enums.AccountStatus;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.preferences.dto.PreferencesResponse;
import org.example.backend.preferences.exceptions.AccountCurrencyFixedException;
import org.example.backend.preferences.dto.UpdatePreferencesRequest;
import org.example.backend.preferences.exceptions.PreferencesAccessDeniedException;
import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.DateFormatOption;
import org.example.backend.preferences.model.LandingPage;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.model.NumberFormatOption;
import org.example.backend.preferences.model.OrderTypeOption;
import org.example.backend.preferences.model.PreferenceRow;
import org.example.backend.preferences.model.ThemeOption;
import org.example.backend.preferences.model.TimeFormatOption;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PreferencesServiceTest {

    private static final long USER_ID = 1000L;
    private static final long ACCOUNT_ID = 1001L;
    private static final OffsetDateTime SAVED_AT = OffsetDateTime.parse("2026-10-06T10:00:00Z");

    @Mock
    private PreferencesMapper preferencesMapper;

    @Mock
    private AccountMapper accountMapper;

    private PreferencesService service;

    @BeforeEach
    void setUp() {
        service = new PreferencesService(preferencesMapper, accountMapper);
    }

    private void accountOwnedBy(int ownerId, String currency) {
        Account account = new Account(
                (int) ACCOUNT_ID, "ACC000001001", LocalDate.of(2022, 1, 10), BigDecimal.TEN, BigDecimal.TEN,
                AccountStatus.ACTIVE, currency, 1L, null, null, ownerId);
        when(accountMapper.selectAccountById((int) ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(accountMapper.selectAccountLinkedUserId((int) ACCOUNT_ID)).thenReturn(ownerId);
    }

    private static UpdatePreferencesRequest request(String currency) {
        return new UpdatePreferencesRequest(
                currency,
                Set.of(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
                Set.of(NotificationCategory.ORDER_STATUS),
                DateFormatOption.DD_MM_YYYY,
                TimeFormatOption.H24,
                NumberFormatOption.IN,
                true,
                ThemeOption.DARK,
                LandingPage.MARKET,
                OrderTypeOption.LIMIT);
    }

    @Test
    void anAccountThatNeverSavedGetsTheDefaultsInItsOwnCurrency() {
        accountOwnedBy((int) USER_ID, "EUR");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenReturn(Optional.empty());

        PreferencesResponse response = service.get(USER_ID, ACCOUNT_ID);

        assertEquals("EUR", response.preferredCurrency());
        assertEquals(EnumSet.of(NotificationChannel.IN_APP), response.channels());
        assertEquals(EnumSet.allOf(NotificationCategory.class), response.categories());
        assertEquals(DateFormatOption.MON_DD_YYYY, response.dateFormat());
        assertEquals(TimeFormatOption.H12, response.timeFormat());
        assertEquals(NumberFormatOption.US, response.numberFormat());
        assertEquals(false, response.aiAssistantEnabled());
        assertEquals(ThemeOption.SYSTEM, response.theme());
        assertEquals(LandingPage.DASHBOARD, response.landingPage());
        assertEquals(OrderTypeOption.MARKET, response.defaultOrderType());
        assertNull(response.updatedAt(), "never saved, so no timestamp");
    }

    @Test
    void aSavedRowIsReturnedAsStored() {
        accountOwnedBy((int) USER_ID, "USD");
        CustomerPreferences saved = request("INR").toPreferences("INR");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID))
                .thenReturn(Optional.of(rowOf(saved, SAVED_AT)));

        PreferencesResponse response = service.get(USER_ID, ACCOUNT_ID);

        // the account's currency is the source of truth, whatever an older row says
        assertEquals("USD", response.preferredCurrency());
        assertEquals(EnumSet.of(NotificationChannel.EMAIL, NotificationChannel.IN_APP), response.channels());
        assertEquals(EnumSet.of(NotificationCategory.ORDER_STATUS), response.categories());
        assertEquals(NumberFormatOption.IN, response.numberFormat());
        assertEquals(SAVED_AT, response.updatedAt());
    }

    @Test
    void updateStoresTheDocumentAndAnswersWithWhatWasStored() {
        accountOwnedBy((int) USER_ID, "USD");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenAnswer(invocation ->
                Optional.of(rowOf(request("USD").toPreferences("USD"), SAVED_AT)));

        PreferencesResponse response = service.update(USER_ID, ACCOUNT_ID, request("USD"));

        ArgumentCaptor<PreferenceRow> stored = ArgumentCaptor.forClass(PreferenceRow.class);
        verify(preferencesMapper).upsert(stored.capture());
        PreferenceRow row = stored.getValue();
        assertEquals(ACCOUNT_ID, row.accountId(), "the account is the path's");
        assertEquals("USD", row.preferredCurrency());
        assertTrue(row.channelEmail());
        assertTrue(row.channelInApp());
        assertEquals(false, row.channelSms());
        assertTrue(row.notifyOrderStatus());
        assertEquals(false, row.notifyWatchlistAlerts());
        assertEquals(SAVED_AT, response.updatedAt());
    }

    @Test
    void emptyChannelsMeansNoNotificationsAndIsStoredAsThree_falseColumns() {
        accountOwnedBy((int) USER_ID, "USD");
        UpdatePreferencesRequest silent = new UpdatePreferencesRequest(
                "USD", Set.of(), Set.of(), DateFormatOption.YYYY_MM_DD, TimeFormatOption.H12, NumberFormatOption.US,
                false, ThemeOption.SYSTEM, LandingPage.DASHBOARD, OrderTypeOption.MARKET);
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenAnswer(invocation ->
                Optional.of(rowOf(silent.toPreferences("USD"), SAVED_AT)));

        PreferencesResponse response = service.update(USER_ID, ACCOUNT_ID, silent);

        ArgumentCaptor<PreferenceRow> stored = ArgumentCaptor.forClass(PreferenceRow.class);
        verify(preferencesMapper).upsert(stored.capture());
        assertEquals(false, stored.getValue().channelSms());
        assertEquals(false, stored.getValue().channelEmail());
        assertEquals(false, stored.getValue().channelInApp());
        assertTrue(response.channels().isEmpty());
    }

    @Test
    void aDifferentCurrencyIsRefusedWithCur409AndNothingIsWritten() {
        accountOwnedBy((int) USER_ID, "EUR");

        AccountCurrencyFixedException refused = assertThrows(
                AccountCurrencyFixedException.class, () -> service.update(USER_ID, ACCOUNT_ID, request("USD")));
        assertThrows(AccountCurrencyFixedException.class, () -> service.update(USER_ID, ACCOUNT_ID, request("XYZ")));

        assertEquals("CUR-409", refused.getErrorCode());
        assertEquals(ACCOUNT_ID, refused.getAccountId());
        verify(preferencesMapper, never()).upsert(any());
    }

    @Test
    void savingTheSameCurrencyIsFineAndStoresTheAccountsCurrency() {
        accountOwnedBy((int) USER_ID, "EUR");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenAnswer(invocation ->
                Optional.of(rowOf(request("EUR").toPreferences("EUR"), SAVED_AT)));

        PreferencesResponse response = service.update(USER_ID, ACCOUNT_ID, request("EUR"));

        ArgumentCaptor<PreferenceRow> stored = ArgumentCaptor.forClass(PreferenceRow.class);
        verify(preferencesMapper).upsert(stored.capture());
        assertEquals("EUR", stored.getValue().preferredCurrency());
        assertEquals("EUR", response.preferredCurrency());
    }

    @Test
    void aSaveWithNoCurrencyKeepsTheAccountsCurrency() {
        accountOwnedBy((int) USER_ID, "JPY");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenAnswer(invocation ->
                Optional.of(rowOf(request(null).toPreferences("JPY"), SAVED_AT)));

        PreferencesResponse response = service.update(USER_ID, ACCOUNT_ID, request(null));

        ArgumentCaptor<PreferenceRow> stored = ArgumentCaptor.forClass(PreferenceRow.class);
        verify(preferencesMapper).upsert(stored.capture());
        assertEquals("JPY", stored.getValue().preferredCurrency());
        assertEquals("JPY", response.preferredCurrency());
    }

    @Test
    void theAccountsCurrencyIsAlwaysReadFromTheAccountEvenIfAnOlderRowSaysOtherwise() {
        accountOwnedBy((int) USER_ID, "GBP");
        when(preferencesMapper.selectByAccountId(ACCOUNT_ID)).thenReturn(Optional.of(rowOf(request("USD").toPreferences("USD"), SAVED_AT)));

        assertEquals("GBP", service.get(USER_ID, ACCOUNT_ID).preferredCurrency());
    }

    @Test
    void someoneElsesAccountIsForbiddenOnBothRoutesAndNothingIsReadOrWritten() {
        accountOwnedBy(2000, "USD");

        assertThrows(PreferencesAccessDeniedException.class, () -> service.get(USER_ID, ACCOUNT_ID));
        assertThrows(PreferencesAccessDeniedException.class, () -> service.update(USER_ID, ACCOUNT_ID, request("USD")));

        verify(preferencesMapper, never()).selectByAccountId(ACCOUNT_ID);
        verify(preferencesMapper, never()).upsert(any());
    }

    @Test
    void anUnknownAccountIsNotFound() {
        when(accountMapper.selectAccountById((int) ACCOUNT_ID)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () -> service.get(USER_ID, ACCOUNT_ID));
        assertThrows(AccountNotFoundException.class, () -> service.update(USER_ID, ACCOUNT_ID, request("USD")));
    }

    private static PreferenceRow rowOf(CustomerPreferences preferences, OffsetDateTime updatedAt) {
        PreferenceRow row = PreferenceRow.of(ACCOUNT_ID, preferences);
        return new PreferenceRow(
                row.accountId(), row.preferredCurrency(), row.channelSms(), row.channelEmail(), row.channelInApp(),
                row.notifyOrderStatus(), row.notifyWatchlistAlerts(), row.notifyStrategyExecution(), row.dateFormat(), row.timeFormat(),
                row.numberFormat(), row.aiAssistantEnabled(), row.theme(), row.landingPage(),
                row.defaultOrderType(), updatedAt);
    }
}
