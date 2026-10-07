package org.example.backend.notifications.email;

import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.QueuedEmail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailAndGuardTest {

    // ---------- the development-only guard ----------

    @Test
    void emailMayRunUnderTheDevOrLocalProfileAgainstALocalHost() {
        assertDoesNotThrow(() -> DevOnlyEmailGuard.check(List.of("dev"), "localhost"));
        assertDoesNotThrow(() -> DevOnlyEmailGuard.check(List.of("local"), "127.0.0.1"));
        assertDoesNotThrow(() -> DevOnlyEmailGuard.check(List.of("dev", "debug"), "mailhog"));
        assertDoesNotThrow(() -> DevOnlyEmailGuard.check(List.of("DEV"), "LocalHost"));
    }

    @Test
    void emailRefusesToStartWithNoDevelopmentProfile() {
        assertThrows(IllegalStateException.class, () -> DevOnlyEmailGuard.check(List.of(), "localhost"));
        assertThrows(IllegalStateException.class, () -> DevOnlyEmailGuard.check(List.of("test"), "localhost"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod", "production", "staging", "PROD"})
    void emailRefusesToStartInAProductionLikeProfileEvenAlongsideDev(String profile) {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> DevOnlyEmailGuard.check(List.of("dev", profile), "localhost"));
        assertTrue(ex.getMessage().contains("development-only"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"smtp.gmail.com", "mail.example.com", "10.0.0.5", "localhost.evil.com", ""})
    void emailRefusesAnSmtpHostThatIsNotLocal(String host) {
        assertThrows(IllegalStateException.class, () -> DevOnlyEmailGuard.check(List.of("dev"), host));
    }

    @Test
    void emailRefusesANullHost() {
        assertThrows(IllegalStateException.class, () -> DevOnlyEmailGuard.check(List.of("dev"), null));
    }

    // ---------- the disabled sender, which is what every other environment gets ----------

    @Test
    void theDisabledSenderReportsDisabledAndNeverSends() {
        DisabledEmailSender sender = new DisabledEmailSender();

        assertFalse(sender.enabled());
        assertThrows(IllegalStateException.class, () -> sender.send("a@b.co", "s", "b"));
    }

    @Test
    void aHeaderValueIsOneLine() {
        assertEquals("Order filled Bcc: evil@example.com", MailHogEmailSender.singleLine("Order filled\r\nBcc: evil@example.com"));
        assertEquals("", MailHogEmailSender.singleLine(null));
    }

    // ---------- the dispatcher ----------

    private NotificationMapper mapper;
    private EmailSender sender;
    private EmailDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        mapper = mock(NotificationMapper.class);
        sender = mock(EmailSender.class);
        when(sender.enabled()).thenReturn(true);
        dispatcher = new EmailDispatcher(mapper, sender, 20, 3);
    }

    private static QueuedEmail queued(int attempts, String recipient) {
        return new QueuedEmail(11, 42, attempts, "Order filled", "Your buy order was filled.", recipient);
    }

    @Test
    void aQueuedEmailIsSentToTheAddressOnFileAndMarkedSent() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "alice@example.com")));

        assertEquals(1, dispatcher.dispatchBatch());

        verify(sender).send(eq("alice@example.com"), eq("Order filled"), anyString());
        verify(mapper).updateDelivery(11, DeliveryStatus.SENT, null);
    }

    @Test
    void theBodyExplainsWhyTheCustomerIsGettingItAndCarriesNoLink() {
        String body = EmailDispatcher.body(queued(0, "alice@example.com"));

        assertTrue(body.startsWith("Your buy order was filled."));
        assertTrue(body.contains("Settings"));
        assertFalse(body.contains("http"));
    }

    @Test
    void aFailedSendStaysQueuedWithItsAttemptCountedUntilTheAttemptsRunOut() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "alice@example.com")));
        doThrow(new EmailDeliveryException("refused", null)).when(sender).send(anyString(), anyString(), anyString());

        dispatcher.dispatchBatch();

        verify(mapper).updateDelivery(11, DeliveryStatus.QUEUED, "The mail server did not accept the message");
    }

    @Test
    void theLastAllowedAttemptMarksTheDeliveryFailed() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(2, "alice@example.com")));
        doThrow(new EmailDeliveryException("refused", null)).when(sender).send(anyString(), anyString(), anyString());

        dispatcher.dispatchBatch();

        verify(mapper).updateDelivery(11, DeliveryStatus.FAILED, "The mail server did not accept the message");
    }

    @Test
    void aDeliveryWithNoRecipientIsSkippedNotFailedBecauseRetryingWouldNotHelp() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, null), queued(0, "  ")));

        dispatcher.dispatchBatch();

        verify(sender, never()).send(anyString(), anyString(), anyString());
        verify(mapper, org.mockito.Mockito.times(2)).updateDelivery(11, DeliveryStatus.SKIPPED, "No email address on file");
    }

    @Test
    void ifEmailWasSwitchedOffAfterQueuingTheDeliveryIsSkipped() {
        when(sender.enabled()).thenReturn(false);
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "alice@example.com")));

        dispatcher.dispatchBatch();

        verify(sender, never()).send(anyString(), anyString(), anyString());
        verify(mapper).updateDelivery(11, DeliveryStatus.SKIPPED, "Email is not enabled in this environment");
    }

    @Test
    void anEmptyQueueDoesNothing() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of());

        assertEquals(0, dispatcher.dispatchBatch());

        verify(mapper, never()).updateDelivery(anyLong(), any(), any());
    }
}
