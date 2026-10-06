package org.example.backend.preferences.resolve;

import org.example.backend.preferences.mapper.PreferencesMapper;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.model.PreferenceRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import java.util.EnumSet;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StoredPreferenceResolverTest {

    private PreferencesMapper mapper;
    private StoredPreferenceResolver resolver;

    @BeforeEach
    void setUp() {
        mapper = mock(PreferencesMapper.class);
        resolver = new StoredPreferenceResolver(mapper);
    }

    @Test
    void nothingStoredAnswersTheDefault() {
        when(mapper.selectByAccountId(5L)).thenReturn(Optional.empty());

        assertSame(AlertPreference.DEFAULT, resolver.resolveAlerts(5L));
    }

    @Test
    void aDatabaseFailureAnswersTheDefaultInsteadOfFailingTheCaller() {
        when(mapper.selectByAccountId(5L)).thenThrow(new DataAccessResourceFailureException("db down"));

        assertSame(AlertPreference.DEFAULT, resolver.resolveAlerts(5L));
    }

    @Test
    void aStoredRowAnswersItsChannelsAndCategories() {
        CustomerPreferences stored = new CustomerPreferences(
                "USD",
                EnumSet.of(NotificationChannel.SMS, NotificationChannel.EMAIL),
                EnumSet.of(NotificationCategory.WATCHLIST_ALERTS),
                null, null, null, false, null, null, null);
        when(mapper.selectByAccountId(5L)).thenReturn(Optional.of(PreferenceRow.of(5L, stored)));

        AlertPreference alerts = resolver.resolveAlerts(5L);

        assertEquals(EnumSet.of(NotificationChannel.SMS, NotificationChannel.EMAIL), alerts.channels());
        assertTrue(alerts.wants(NotificationCategory.WATCHLIST_ALERTS));
        assertFalse(alerts.wants(NotificationCategory.ORDER_STATUS));
    }

    @Test
    void noNotificationsIsRespectedNotTreatedAsMissing() {
        CustomerPreferences silent = new CustomerPreferences(
                "USD", EnumSet.noneOf(NotificationChannel.class), EnumSet.allOf(NotificationCategory.class),
                null, null, null, false, null, null, null);
        when(mapper.selectByAccountId(5L)).thenReturn(Optional.of(PreferenceRow.of(5L, silent)));

        AlertPreference alerts = resolver.resolveAlerts(5L);

        assertTrue(alerts.channels().isEmpty());
        assertFalse(alerts.wants(NotificationCategory.ORDER_STATUS));
    }

    @Test
    void theDefaultIsInAppOnlyAndEveryCategory() {
        assertEquals(EnumSet.of(NotificationChannel.IN_APP), AlertPreference.DEFAULT.channels());
        assertTrue(AlertPreference.DEFAULT.wants(NotificationCategory.ORDER_STATUS));
        assertTrue(AlertPreference.DEFAULT.wants(NotificationCategory.WATCHLIST_ALERTS));
    }

    @Test
    void theAnswerCannotBeChangedByACaller() {
        assertThrows(UnsupportedOperationException.class,
                () -> AlertPreference.DEFAULT.channels().add(NotificationChannel.SMS));
    }
}
