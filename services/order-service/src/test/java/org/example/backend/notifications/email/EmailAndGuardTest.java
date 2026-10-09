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

    // ---------- the mode rules ----------

    private static EmailEnvironmentGuard.Settings settings(String host, String tls, String user, String pass, String from,
                                                           List<String> fromDomains, List<String> allowed) {
        return new EmailEnvironmentGuard.Settings(host, tls, user, pass, from, fromDomains, allowed);
    }

    private static final EmailEnvironmentGuard.Settings LOCAL =
            settings("localhost", "none", "", "", "noreply@etpteamriya.com", List.of(), List.of());
    private static final EmailEnvironmentGuard.Settings REAL =
            settings("smtp.provider.com", "starttls", "u", "p", "noreply@etpteamriya.com", List.of("etpteamriya.com"), List.of());

    @Test
    void devMayRunAgainstALocalHost() {
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("dev"), LOCAL));
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("DEV", "debug"), LOCAL));
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("local"),
                settings("host.docker.internal", "none", "", "", "a@b.co", List.of(), List.of())));
    }

    @ParameterizedTest
    @ValueSource(strings = {"smtp.gmail.com", "10.0.0.5", "localhost.evil.com", ""})
    void devRefusesANonLocalHost(String host) {
        assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of("dev"),
                settings(host, "none", "", "", "a@b.co", List.of(), List.of())));
    }

    @Test
    void enabledWithNoModeProfileIsRefused() {
        assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of(), LOCAL));
        assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of("test"), REAL));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod", "production", "staging", "PROD"})
    void devAlongsideAProductionLikeProfileIsRefused(String profile) {
        assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of("dev", profile), LOCAL));
    }

    @Test
    void prodAcceptsAFullyConfiguredProvider() {
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("prod"), REAL));
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("production"),
                settings("smtp.provider.com", "implicit", "u", "p", "x@etpteamriya.com", List.of("etpteamriya.com"), List.of())));
    }

    @Test
    void prodRefusesEveryUnsafeSettingAndNamesIt() {
        List<String> ok = List.of("etpteamriya.com");
        String localHost = message(settings("localhost", "starttls", "u", "p", "n@etpteamriya.com", ok, List.of()));
        String noTls = message(settings("smtp.p.com", "none", "u", "p", "n@etpteamriya.com", ok, List.of()));
        String noLogin = message(settings("smtp.p.com", "starttls", "", "", "n@etpteamriya.com", ok, List.of()));
        String noDomains = message(settings("smtp.p.com", "starttls", "u", "p", "n@etpteamriya.com", List.of(), List.of()));
        String wrongFrom = message(settings("smtp.p.com", "starttls", "u", "p", "n@other.com", ok, List.of()));

        assertTrue(localHost.contains("smtp.host"));
        assertTrue(noTls.contains("smtp.tls"));
        assertTrue(noLogin.contains("username"));
        assertTrue(noDomains.contains("from-domains"));
        assertTrue(wrongFrom.contains("notifications.email.from"));
    }

    @Test
    void stagingNeedsARecipientAllowListSoItCannotMailCustomers() {
        assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of("staging"), REAL));
        assertDoesNotThrow(() -> EmailEnvironmentGuard.check(List.of("staging"),
                settings("smtp.provider.com", "starttls", "u", "p", "n@etpteamriya.com", List.of("etpteamriya.com"), List.of("etpteamriya.com"))));
    }

    private static String message(EmailEnvironmentGuard.Settings settings) {
        return assertThrows(IllegalStateException.class, () -> EmailEnvironmentGuard.check(List.of("prod"), settings)).getMessage();
    }

    @Test
    void domainsAreParsedLowercasedAndTrimmed() {
        assertEquals(List.of("a.com", "b.org"), EmailEnvironmentGuard.domains(" A.com, ,B.org "));
        assertEquals("example.com", EmailEnvironmentGuard.domainOf("Bob@Example.com"));
        assertEquals("", EmailEnvironmentGuard.domainOf("nobody"));
    }

    // ---------- the sender's settings ----------

    @Test
    void tlsSettingsAreStrictAndNoneAddsNothing() {
        java.util.Properties starttls = SmtpEmailSender.properties("starttls", true);
        assertEquals("true", starttls.get("mail.smtp.starttls.required"));
        assertEquals("true", starttls.get("mail.smtp.ssl.checkserveridentity"));
        assertEquals("true", starttls.get("mail.smtp.auth"));
        java.util.Properties implicit = SmtpEmailSender.properties("implicit", false);
        assertEquals("true", implicit.get("mail.smtp.ssl.enable"));
        assertEquals("TLSv1.2 TLSv1.3", implicit.get("mail.smtp.ssl.protocols"));
        java.util.Properties none = SmtpEmailSender.properties("none", false);
        assertFalse(none.containsKey("mail.smtp.starttls.enable"));
        assertFalse(none.containsKey("mail.smtp.ssl.enable"));
    }

    @Test
    void onlyAFiveHundredAnswerOrABadAddressIsPermanent() {
        assertTrue(SmtpEmailSender.isPermanent(new RuntimeException(new jakarta.mail.internet.AddressException("bad"))));
        assertTrue(SmtpEmailSender.isPermanent(new org.eclipse.angus.mail.smtp.SMTPSendFailedException("RCPT", 550, "no", null, null, null, null)));
        assertFalse(SmtpEmailSender.isPermanent(new org.eclipse.angus.mail.smtp.SMTPSendFailedException("RCPT", 451, "later", null, null, null, null)));
        assertFalse(SmtpEmailSender.isPermanent(new java.net.ConnectException("refused")));
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
        assertEquals("Order filled Bcc: evil@example.com", SmtpEmailSender.singleLine("Order filled\r\nBcc: evil@example.com"));
        assertEquals("", SmtpEmailSender.singleLine(null));
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

    @Test
    void aPermanentRefusalFailsTheDeliveryAtOnceWithoutRetrying() {
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "alice@example.com")));
        doThrow(new EmailDeliveryException("refused", null, true)).when(sender).send(anyString(), anyString(), anyString());

        dispatcher.dispatchBatch();

        verify(mapper).updateDelivery(11, DeliveryStatus.FAILED, "The mail server refused the address");
    }

    @Test
    void anAddressOffTheAllowListIsSkippedNotSent() {
        EmailDispatcher restricted = new EmailDispatcher(mapper, sender, 20, 3, 0, List.of("etpteamriya.com"), java.time.Clock.systemUTC());
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "alice@example.com"), queued(0, "bob@etpteamriya.com")));

        restricted.dispatchBatch();

        verify(mapper).updateDelivery(11, DeliveryStatus.SKIPPED, "RECIPIENT_NOT_ALLOWED");
        verify(sender).send(eq("bob@etpteamriya.com"), anyString(), anyString());
    }

    @Test
    void thePerMinuteCapLeavesTheRestQueuedAndResetsWhenTheMinutePasses() {
        java.time.Instant t0 = java.time.Instant.parse("2026-01-01T00:00:00Z");
        java.util.concurrent.atomic.AtomicReference<java.time.Instant> now = new java.util.concurrent.atomic.AtomicReference<>(t0);
        java.time.Clock clock = new java.time.Clock() {
            public java.time.ZoneId getZone() { return java.time.ZoneOffset.UTC; }
            public java.time.Clock withZone(java.time.ZoneId zone) { return this; }
            public java.time.Instant instant() { return now.get(); }
        };
        EmailDispatcher capped = new EmailDispatcher(mapper, sender, 20, 3, 1, List.of(), clock);
        when(mapper.selectQueuedEmails(20)).thenReturn(List.of(queued(0, "a@b.co"), queued(0, "c@d.co")));

        assertEquals(1, capped.dispatchBatch());
        verify(sender, org.mockito.Mockito.times(1)).send(anyString(), anyString(), anyString());

        now.set(t0.plusSeconds(61));
        capped.dispatchBatch();
        verify(sender, org.mockito.Mockito.times(2)).send(anyString(), anyString(), anyString());
    }

    // ---------- a real SMTP server over TLS, with a login ----------

    private static java.util.Properties trustAnything() {
        java.util.Properties trust = new java.util.Properties();
        trust.put("mail.smtp.ssl.trust", "*");
        trust.put("mail.smtp.ssl.checkserveridentity", "false");
        return trust;
    }

    @Test
    void sendsOverImplicitTlsWithALoginToARealSmtpServer() throws Exception {
        com.icegreen.greenmail.util.ServerSetup setup = com.icegreen.greenmail.util.ServerSetupTest.SMTPS;
        com.icegreen.greenmail.util.GreenMail server = new com.icegreen.greenmail.util.GreenMail(setup);
        server.setUser("alice@example.com", "u", "secret");
        server.start();
        try {
            SmtpEmailSender smtp = new SmtpEmailSender("localhost", setup.getPort(), "implicit", "u", "secret",
                    "noreply@etpteamriya.com", "", trustAnything());

            smtp.send("alice@example.com", "Order filled\r\nBcc: evil@example.com", "Hello");

            assertTrue(server.waitForIncomingEmail(5000, 1));
            jakarta.mail.internet.MimeMessage received = server.getReceivedMessages()[0];
            assertEquals("Order filled Bcc: evil@example.com", received.getSubject());
            assertEquals("noreply@etpteamriya.com", received.getFrom()[0].toString());
            assertEquals("Hello", received.getContent().toString().trim());
        } finally {
            server.stop();
        }
    }

    @Test
    void aWrongPasswordIsATransientFailureNotAPermanentOne() {
        com.icegreen.greenmail.util.ServerSetup setup = com.icegreen.greenmail.util.ServerSetupTest.SMTPS;
        com.icegreen.greenmail.util.GreenMail server = new com.icegreen.greenmail.util.GreenMail(setup);
        server.setUser("alice@example.com", "u", "secret");
        server.start();
        try {
            SmtpEmailSender smtp = new SmtpEmailSender("localhost", setup.getPort(), "implicit", "u", "wrong",
                    "noreply@etpteamriya.com", "", trustAnything());

            EmailDeliveryException ex = assertThrows(EmailDeliveryException.class, () -> smtp.send("alice@example.com", "s", "b"));

            assertFalse(ex.isPermanent());
            assertFalse(ex.getMessage().contains("wrong"));
        } finally {
            server.stop();
        }
    }
}
