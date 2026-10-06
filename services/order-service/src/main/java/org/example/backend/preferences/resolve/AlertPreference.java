package org.example.backend.preferences.resolve;

import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;

import java.util.EnumSet;
import java.util.Set;

/**
 * How one account wants to be alerted, which is all the notification path needs to know. It carries no contact
 * detail: the address for a channel is looked up where it already lives, by whoever sends.
 *
 * <p>An empty {@code channels} set means the customer chose "no notifications", and a sender must respect it.
 */
public record AlertPreference(Set<NotificationChannel> channels, Set<NotificationCategory> categories) {

    /**
     * What applies when nothing is stored, or the store cannot be read: in-app only, every category. In-app is the
     * one channel with no cost and no personal address, so it is the safest thing to do on a guess.
     */
    public static final AlertPreference DEFAULT = new AlertPreference(
            EnumSet.of(NotificationChannel.IN_APP),
            EnumSet.allOf(NotificationCategory.class));

    public AlertPreference {
        channels = copy(channels, NotificationChannel.class);
        categories = copy(categories, NotificationCategory.class);
    }

    /** True when the customer wants to hear about {@code category} on at least one channel. */
    public boolean wants(NotificationCategory category) {
        return !channels.isEmpty() && categories.contains(category);
    }

    private static <E extends Enum<E>> Set<E> copy(Set<E> source, Class<E> type) {
        EnumSet<E> copy = EnumSet.noneOf(type);
        if (source != null) {
            copy.addAll(source);
        }
        return java.util.Collections.unmodifiableSet(copy);
    }
}
