package org.example.backend.preferences.model;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * One customer's preferences, as the rest of the platform sees them. Immutable; the sets are copies.
 *
 * <p>{@link #defaults} is what applies when nothing has been saved: in-app alerts only (the one channel that costs
 * nothing and needs no contact detail), every category on, and the formats the application used before any of this
 * was configurable.
 */
public record CustomerPreferences(
        String preferredCurrency,
        Set<NotificationChannel> channels,
        Set<NotificationCategory> categories,
        DateFormatOption dateFormat,
        TimeFormatOption timeFormat,
        NumberFormatOption numberFormat,
        boolean aiAssistantEnabled,
        ThemeOption theme,
        LandingPage landingPage,
        OrderTypeOption defaultOrderType) {

    public CustomerPreferences {
        channels = copyOf(channels, NotificationChannel.class);
        categories = copyOf(categories, NotificationCategory.class);
    }

    /** The defaults for an account whose own currency is {@code accountCurrency}. */
    public static CustomerPreferences defaults(String accountCurrency) {
        return new CustomerPreferences(
                accountCurrency,
                EnumSet.of(NotificationChannel.IN_APP),
                EnumSet.allOf(NotificationCategory.class),
                DateFormatOption.MON_DD_YYYY,
                TimeFormatOption.H12,
                NumberFormatOption.US,
                false,
                ThemeOption.SYSTEM,
                LandingPage.DASHBOARD,
                OrderTypeOption.MARKET);
    }

    /** The same preferences with another currency (the account's, which is the source of truth for it). */
    public CustomerPreferences withPreferredCurrency(String currency) {
        return new CustomerPreferences(
                currency, channels, categories, dateFormat, timeFormat, numberFormat, aiAssistantEnabled, theme,
                landingPage, defaultOrderType);
    }

    private static <E extends Enum<E>> Set<E> copyOf(Set<E> source, Class<E> type) {
        EnumSet<E> copy = EnumSet.noneOf(type);
        if (source != null) {
            copy.addAll(source);
        }
        return Collections.unmodifiableSet(copy);
    }
}
