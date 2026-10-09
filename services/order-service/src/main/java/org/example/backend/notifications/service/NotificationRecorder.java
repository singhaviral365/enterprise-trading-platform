package org.example.backend.notifications.service;

import org.example.backend.notifications.email.EmailSender;
import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationGateway;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.NewNotification;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.resolve.AlertPreference;
import org.example.backend.preferences.resolve.PreferenceResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Records a notification and routes it. This is the whole of "durably recorded for delivery": when {@link #deliver}
 * returns, the notification and its per-channel deliveries are committed together, and the caller (a Kafka listener)
 * may commit its offset. What happens next on a slow channel is the dispatcher's business, not the caller's.
 *
 * <p><b>The channel is resolved here, on every call</b>, from Customer Preferences through the
 * {@link PreferenceResolver} interface. Nothing is cached and no channel is a constant. The result is written onto the
 * notification ({@code channels}), so which channel was used is a record, not a claim. A customer whose preferences do
 * not want this category, or who chose "no notifications", still gets the row (so the decision is visible) with channel
 * {@code NONE}; it is simply not shown in the bell and nothing is sent.
 *
 * <p><b>Idempotency</b> is the database's: the event key is unique, so a second call with the same key inserts nothing
 * and creates no delivery, and {@link GatewayResult#DUPLICATE} comes back.
 *
 * <ul>
 *   <li>{@code IN_APP}: the row is the delivery. Nothing more to do.</li>
 *   <li>{@code EMAIL}: a delivery row, {@code QUEUED} if email is enabled here and an address is held, otherwise
 *       {@code SKIPPED} with the reason.</li>
 *   <li>{@code SMS}: a delivery row, always {@code SKIPPED} for now: no SMS provider is provisioned (see the module
 *       README for the plan). The routing decision is still real and recorded.</li>
 * </ul>
 */
@Service
public class NotificationRecorder implements NotificationGateway {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationRecorder.class);
    static final String NO_CHANNEL = "NONE";

    private final NotificationMapper mapper;
    private final PreferenceResolver preferences;
    private final EmailSender emailSender;
    private final Clock clock;

    // Two constructors (the other lets tests fix the clock), so Spring has to be told which one to use.
    @Autowired
    public NotificationRecorder(NotificationMapper mapper, PreferenceResolver preferences, EmailSender emailSender) {
        this(mapper, preferences, emailSender, Clock.systemUTC());
    }

    NotificationRecorder(
            NotificationMapper mapper,
            PreferenceResolver preferences,
            EmailSender emailSender,
            Clock clock) {
        this.mapper = mapper;
        this.preferences = preferences;
        this.emailSender = emailSender;
        this.clock = clock;
    }

    @Override
    @Transactional
    public GatewayResult deliver(NotificationRequest request) {
        AlertPreference preference = preferences.resolveAlerts(request.accountId());
        // Not EnumSet.copyOf: it refuses an empty collection that is not itself an EnumSet, which is "no notifications".
        Set<NotificationChannel> channels = EnumSet.noneOf(NotificationChannel.class);
        if (preference.wants(request.category())) {
            channels.addAll(preference.channels());
        }

        NewNotification row = new NewNotification(
                request.accountId(),
                request.category(),
                request.eventKey(),
                request.title(),
                request.message(),
                channelText(channels),
                channels.contains(NotificationChannel.IN_APP),
                OffsetDateTime.now(clock));

        if (mapper.insertNotificationIfNew(row) == 0 || row.getNotificationId() == null) {
            LOGGER.info("Notification for event {} was already recorded; not sending again", request.eventKey());
            return GatewayResult.DUPLICATE;
        }

        long id = row.getNotificationId();
        for (NotificationChannel channel : channels) {
            switch (channel) {
                case EMAIL -> routeEmail(id, request.accountId());
                case SMS -> mapper.insertDelivery(id, NotificationChannel.SMS, DeliveryStatus.SKIPPED,
                        "SMS channel is not provisioned");
                case IN_APP -> {
                    // The inbox row is the delivery.
                }
            }
        }
        LOGGER.info("Recorded notification {} for account {} on [{}]", id, request.accountId(), row.getChannels());
        return GatewayResult.RECORDED;
    }

    private void routeEmail(long notificationId, long accountId) {
        if (!emailSender.enabled()) {
            mapper.insertDelivery(notificationId, NotificationChannel.EMAIL, DeliveryStatus.SKIPPED,
                    "Email is not enabled in this environment");
        } else if (mapper.selectAccountEmail(accountId).isEmpty()) {
            mapper.insertDelivery(notificationId, NotificationChannel.EMAIL, DeliveryStatus.SKIPPED,
                    "No email address on file");
        } else {
            mapper.insertDelivery(notificationId, NotificationChannel.EMAIL, DeliveryStatus.QUEUED, null);
        }
    }

    static String channelText(Set<NotificationChannel> channels) {
        return channels.isEmpty()
                ? NO_CHANNEL
                : channels.stream().map(Enum::name).collect(Collectors.joining(","));
    }
}
