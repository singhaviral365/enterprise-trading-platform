package org.example.backend.notifications.service;

import org.example.backend.notifications.email.EmailSender;
import org.example.backend.notifications.gateway.GatewayResult;
import org.example.backend.notifications.gateway.NotificationRequest;
import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.NewNotification;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.preferences.resolve.AlertPreference;
import org.example.backend.preferences.resolve.PreferenceResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationRecorderTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-06T10:00:00Z"), ZoneOffset.UTC);
    private static final Set<NotificationCategory> ALL = EnumSet.allOf(NotificationCategory.class);

    private NotificationMapper mapper;
    private PreferenceResolver preferences;
    private EmailSender email;
    private NotificationRecorder recorder;

    @BeforeEach
    void setUp() {
        mapper = mock(NotificationMapper.class);
        preferences = mock(PreferenceResolver.class);
        email = mock(EmailSender.class);
        recorder = new NotificationRecorder(mapper, preferences, email, CLOCK);

        // A new event: the insert succeeds and the database hands back an id.
        when(mapper.insertNotificationIfNew(any())).thenAnswer(invocation -> {
            NewNotification row = invocation.getArgument(0);
            row.setNotificationId(42L);
            return 1;
        });
    }

    private static NotificationRequest filled() {
        return new NotificationRequest(7, NotificationCategory.ORDER_STATUS, "evt-1", "Order filled", "Your buy order was filled.");
    }

    private void prefers(Set<NotificationChannel> channels) {
        when(preferences.resolveAlerts(7)).thenReturn(new AlertPreference(channels, ALL));
    }

    private NewNotification recorded() {
        ArgumentCaptor<NewNotification> captor = ArgumentCaptor.forClass(NewNotification.class);
        verify(mapper).insertNotificationIfNew(captor.capture());
        return captor.getValue();
    }

    @Test
    void aFilledOrderProducesAnInAppNotificationOnTheResolvedChannel() {
        prefers(EnumSet.of(NotificationChannel.IN_APP));

        assertEquals(GatewayResult.RECORDED, recorder.deliver(filled()));

        NewNotification row = recorded();
        assertEquals(7, row.getAccountId());
        assertEquals(NotificationCategory.ORDER_STATUS, row.getCategory());
        assertEquals("evt-1", row.getEventKey());
        assertEquals("IN_APP", row.getChannels());
        assertTrue(row.isInApp());
        // The inbox row is the in-app delivery: there is nothing else to queue.
        verify(mapper, never()).insertDelivery(anyLong(), any(), any(), any());
    }

    @Test
    void theChannelIsResolvedFromPreferencesOnEverySendSoChangingThePreferenceChangesTheChannel() {
        when(email.enabled()).thenReturn(true);
        when(mapper.selectAccountEmail(7)).thenReturn(Optional.of("alice@example.com"));

        prefers(EnumSet.of(NotificationChannel.IN_APP));
        recorder.deliver(filled());

        prefers(EnumSet.of(NotificationChannel.EMAIL));
        recorder.deliver(new NotificationRequest(7, NotificationCategory.ORDER_STATUS, "evt-2", "Order filled", "Another."));

        ArgumentCaptor<NewNotification> captor = ArgumentCaptor.forClass(NewNotification.class);
        verify(mapper, times(2)).insertNotificationIfNew(captor.capture());
        assertEquals("IN_APP", captor.getAllValues().get(0).getChannels());
        assertEquals("EMAIL", captor.getAllValues().get(1).getChannels());
        assertFalse(captor.getAllValues().get(1).isInApp(), "an email-only notification does not appear in the bell");
        verify(preferences, times(2)).resolveAlerts(7);
        verify(mapper).insertDelivery(42L, NotificationChannel.EMAIL, DeliveryStatus.QUEUED, null);
    }

    @Test
    void aReplayedEventRecordsAndSendsNothingTheSecondTime() {
        prefers(EnumSet.of(NotificationChannel.IN_APP, NotificationChannel.EMAIL));
        org.mockito.Mockito.doReturn(0).when(mapper).insertNotificationIfNew(any());

        assertEquals(GatewayResult.DUPLICATE, recorder.deliver(filled()));

        verify(mapper, never()).insertDelivery(anyLong(), any(), any(), any());
        verify(mapper, never()).selectAccountEmail(anyLong());
    }

    @Test
    void aCustomerWhoOptedOutIsRecordedAsNoneAndNothingIsSent() {
        when(preferences.resolveAlerts(7)).thenReturn(new AlertPreference(EnumSet.noneOf(NotificationChannel.class), ALL));

        assertEquals(GatewayResult.RECORDED, recorder.deliver(filled()));

        NewNotification row = recorded();
        assertEquals("NONE", row.getChannels());
        assertFalse(row.isInApp());
        verify(mapper, never()).insertDelivery(anyLong(), any(), any(), any());
    }

    @Test
    void aCategoryTheCustomerDoesNotWantIsNotRouted() {
        when(preferences.resolveAlerts(7)).thenReturn(new AlertPreference(
                EnumSet.of(NotificationChannel.IN_APP), EnumSet.of(NotificationCategory.WATCHLIST_ALERTS)));

        recorder.deliver(filled());

        assertEquals("NONE", recorded().getChannels());
    }

    @Test
    void emailIsSkippedWithAReasonWhenItIsNotEnabledInThisEnvironment() {
        prefers(EnumSet.of(NotificationChannel.EMAIL));
        when(email.enabled()).thenReturn(false);

        recorder.deliver(filled());

        verify(mapper).insertDelivery(42L, NotificationChannel.EMAIL, DeliveryStatus.SKIPPED, "Email is not enabled in this environment");
        verify(mapper, never()).selectAccountEmail(anyLong());
    }

    @Test
    void emailIsSkippedWhenNoAddressIsOnFile() {
        prefers(EnumSet.of(NotificationChannel.EMAIL));
        when(email.enabled()).thenReturn(true);
        when(mapper.selectAccountEmail(7)).thenReturn(Optional.empty());

        recorder.deliver(filled());

        verify(mapper).insertDelivery(42L, NotificationChannel.EMAIL, DeliveryStatus.SKIPPED, "No email address on file");
    }

    @Test
    void smsIsRoutedAndRecordedAsSkippedBecauseNoProviderIsProvisioned() {
        prefers(EnumSet.of(NotificationChannel.SMS));

        recorder.deliver(filled());

        assertEquals("SMS", recorded().getChannels());
        verify(mapper).insertDelivery(eq(42L), eq(NotificationChannel.SMS), eq(DeliveryStatus.SKIPPED), eq("SMS channel is not provisioned"));
    }

    @Test
    void severalChannelsAreRecordedTogether() {
        prefers(EnumSet.allOf(NotificationChannel.class));
        when(email.enabled()).thenReturn(true);
        when(mapper.selectAccountEmail(7)).thenReturn(Optional.of("alice@example.com"));

        recorder.deliver(filled());

        assertEquals("SMS,EMAIL,IN_APP", recorded().getChannels());
        verify(mapper, times(2)).insertDelivery(anyLong(), any(), any(), any());
    }
}
