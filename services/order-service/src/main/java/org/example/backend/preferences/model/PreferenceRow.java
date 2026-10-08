package org.example.backend.preferences.model;

import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.Set;

/**
 * A {@code customer_preference} row, column for column. The channels and categories are one boolean column each, so
 * the database can check them and no list has to be parsed; {@link #toPreferences} and {@link #of} convert.
 */
public record PreferenceRow(
        long accountId,
        String preferredCurrency,
        boolean channelSms,
        boolean channelEmail,
        boolean channelInApp,
        boolean notifyOrderStatus,
        boolean notifyWatchlistAlerts,
        boolean notifyStrategyExecution,
        DateFormatOption dateFormat,
        TimeFormatOption timeFormat,
        NumberFormatOption numberFormat,
        boolean aiAssistantEnabled,
        ThemeOption theme,
        LandingPage landingPage,
        OrderTypeOption defaultOrderType,
        OffsetDateTime updatedAt) {

    public static PreferenceRow of(long accountId, CustomerPreferences preferences) {
        return new PreferenceRow(
                accountId,
                preferences.preferredCurrency(),
                preferences.channels().contains(NotificationChannel.SMS),
                preferences.channels().contains(NotificationChannel.EMAIL),
                preferences.channels().contains(NotificationChannel.IN_APP),
                preferences.categories().contains(NotificationCategory.ORDER_STATUS),
                preferences.categories().contains(NotificationCategory.WATCHLIST_ALERTS),
                preferences.categories().contains(NotificationCategory.STRATEGY_EXECUTION),
                preferences.dateFormat(),
                preferences.timeFormat(),
                preferences.numberFormat(),
                preferences.aiAssistantEnabled(),
                preferences.theme(),
                preferences.landingPage(),
                preferences.defaultOrderType(),
                null);
    }

    public CustomerPreferences toPreferences() {
        Set<NotificationChannel> channels = EnumSet.noneOf(NotificationChannel.class);
        if (channelSms) {
            channels.add(NotificationChannel.SMS);
        }
        if (channelEmail) {
            channels.add(NotificationChannel.EMAIL);
        }
        if (channelInApp) {
            channels.add(NotificationChannel.IN_APP);
        }
        Set<NotificationCategory> categories = EnumSet.noneOf(NotificationCategory.class);
        if (notifyOrderStatus) {
            categories.add(NotificationCategory.ORDER_STATUS);
        }
        if (notifyWatchlistAlerts) {
            categories.add(NotificationCategory.WATCHLIST_ALERTS);
        }
        if (notifyStrategyExecution) {
            categories.add(NotificationCategory.STRATEGY_EXECUTION);
        }
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
