package org.example.backend.notifications.email;

import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Sends through a local SMTP catcher (MailHog) so a developer can see exactly what a customer would receive without
 * anything leaving the machine. <b>Development only</b>: this bean exists only when
 * {@code notifications.email.enabled=true}, and {@link DevOnlyEmailGuard} refuses to start the application if that is
 * set outside a development profile or with an SMTP host that is not local.
 *
 * <p>It builds its own {@link JavaMailSenderImpl} from {@code notifications.email.smtp.*} rather than using Spring
 * Boot's mail auto-configuration, so nothing else in the application can pick up an SMTP server by accident.
 */
@Component
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "true")
public class MailHogEmailSender implements EmailSender {

    private final JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
    private final String from;

    public MailHogEmailSender(
            @Value("${notifications.email.smtp.host:localhost}") String host,
            @Value("${notifications.email.smtp.port:1025}") int port,
            @Value("${notifications.email.from:noreply@etpteamriya.com}") String from) {
        mailSender.setHost(host);
        mailSender.setPort(port);
        mailSender.setDefaultEncoding(StandardCharsets.UTF_8.name());
        // MailHog accepts anything and needs no login; there is deliberately nothing to configure here for one.
        this.from = from;
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public void send(String to, String subject, String body) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(singleLine(subject));
            helper.setText(body, false);
            mailSender.send(message);
        } catch (MailException | jakarta.mail.MessagingException ex) {
            // The cause can name the recipient or the server; the caller records only a fixed reason.
            throw new EmailDeliveryException("The mail server did not accept the message", ex);
        }
    }

    /** A header value must be one line: a CR or LF in it is how a header gets injected. */
    static String singleLine(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n]+", " ").trim();
    }
}
