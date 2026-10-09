package org.example.backend.preferences.dto;

import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.DateFormatOption;
import org.example.backend.preferences.model.LandingPage;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.model.NumberFormatOption;
import org.example.backend.preferences.model.OrderTypeOption;
import org.example.backend.preferences.model.ThemeOption;
import org.example.backend.preferences.model.TimeFormatOption;

import java.time.OffsetDateTime;
import java.util.Set;

/**
 * What the settings screen reads. {@code updatedAt} is null while the customer has never saved anything, which is
 * also how the screen knows it is showing the defaults.
 */
public record PreferencesResponse(
        long accountId,
        String preferredCurrency,
        Set<NotificationChannel> channels,
        Set<NotificationCategory> categories,
        DateFormatOption dateFormat,
        TimeFormatOption timeFormat,
        NumberFormatOption numberFormat,
        boolean aiAssistantEnabled,
        ThemeOption theme,
        LandingPage landingPage,
        OrderTypeOption defaultOrderType,
        OffsetDateTime updatedAt) {

    public static PreferencesResponse of(long accountId, CustomerPreferences preferences, OffsetDateTime updatedAt) {
        return new PreferencesResponse(
                accountId,
                preferences.preferredCurrency(),
                preferences.channels(),
                preferences.categories(),
                preferences.dateFormat(),
                preferences.timeFormat(),
                preferences.numberFormat(),
                preferences.aiAssistantEnabled(),
                preferences.theme(),
                preferences.landingPage(),
                preferences.defaultOrderType(),
                updatedAt);
    }
}
