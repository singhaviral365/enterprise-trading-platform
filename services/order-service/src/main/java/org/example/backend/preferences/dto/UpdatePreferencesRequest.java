package org.example.backend.preferences.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.example.backend.preferences.model.CustomerPreferences;
import org.example.backend.preferences.model.DateFormatOption;
import org.example.backend.preferences.model.LandingPage;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.model.NumberFormatOption;
import org.example.backend.preferences.model.OrderTypeOption;
import org.example.backend.preferences.model.ThemeOption;
import org.example.backend.preferences.model.TimeFormatOption;

import java.util.Set;

/**
 * The whole preferences document. A save replaces it (PUT), so every field is required: the settings screen always
 * has all of them, and a half-sent document cannot silently reset the rest. An empty {@code channels} set means
 * "no notifications".
 */
public record UpdatePreferencesRequest(
        @NotNull @Pattern(regexp = "[A-Z]{3}") String preferredCurrency,
        @NotNull Set<@NotNull NotificationChannel> channels,
        @NotNull Set<@NotNull NotificationCategory> categories,
        @NotNull DateFormatOption dateFormat,
        @NotNull TimeFormatOption timeFormat,
        @NotNull NumberFormatOption numberFormat,
        @NotNull Boolean aiAssistantEnabled,
        @NotNull ThemeOption theme,
        @NotNull LandingPage landingPage,
        @NotNull OrderTypeOption defaultOrderType) {

    public CustomerPreferences toPreferences() {
        return new CustomerPreferences(
                preferredCurrency,
                channels,
                categories,
                dateFormat,
                timeFormat,
                numberFormat,
                aiAssistantEnabled,
                theme,
                landingPage,
                defaultOrderType);
    }
}
