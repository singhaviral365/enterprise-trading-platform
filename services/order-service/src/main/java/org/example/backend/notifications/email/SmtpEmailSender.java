package org.example.backend.notifications.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.MimeMessage;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Properties;

/**
 * Sends through an SMTP server, for the two modes that send anything (see {@link EmailEnvironmentGuard}):
 *
 * <ul>
 *   <li><b>dev</b>: a local catcher (MailHog), plain SMTP, no TLS, no login. Nothing leaves the machine.</li>
 *   <li><b>prod</b>: a real provider over TLS ({@code starttls} on 587, or {@code implicit} on 465) with a login. The server
 *       certificate and its host name are always verified, and only TLS 1.2 or newer is spoken; there is no setting that turns
 *       that off.</li>
 * </ul>
 *
 * <p>This bean exists only when {@code notifications.email.enabled=true}. It builds its own {@link JavaMailSenderImpl} from
 * {@code notifications.email.smtp.*} rather than using Spring Boot's mail auto-configuration, so nothing else in the application
 * can pick up an SMTP server by accident. Each message goes out as plain text, and the recipient is always the address held for the
 * account: no request supplies an address or a server.
 *
 * <p>A failure is reported as an {@link EmailDeliveryException} that says whether retrying could help: a 5xx answer for an address
 * or an unparsable address is permanent, anything else (a 4xx, a timeout, a refused connection) is not. The exception text never
 * carries an address, a credential or the message.
 */
@Component
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "true")
public class SmtpEmailSender implements EmailSender {

    private final JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
    private final String from;
    private final String replyTo;

    @Autowired
    public SmtpEmailSender(
            @Value("${notifications.email.smtp.host}") String host,
            // A blank port (the key present but empty in config/application.yml) means the usual port for the TLS setting.
            @Value("#{'${notifications.email.smtp.port:}'.isBlank() ? ('${notifications.email.smtp.tls:none}' == 'implicit' ? 465 : ('${notifications.email.smtp.tls:none}' == 'starttls' ? 587 : 1025)) : '${notifications.email.smtp.port:}'}") int port,
            @Value("${notifications.email.smtp.tls:none}") String tls,
            @Value("${notifications.email.smtp.username:}") String username,
            @Value("${notifications.email.smtp.password:}") String password,
            @Value("${notifications.email.from}") String from,
            @Value("${notifications.email.reply-to:}") String replyTo) {
        this(host, port, tls, username, password, from, replyTo, new Properties());
    }

    /** {@code overrides} are applied last; only a test uses them (for instance to trust a throwaway certificate). */
    SmtpEmailSender(String host, int port, String tls, String username, String password, String from, String replyTo, Properties overrides) {
        mailSender.setHost(host);
        mailSender.setPort(port);
        mailSender.setDefaultEncoding(StandardCharsets.UTF_8.name());
        mailSender.setJavaMailProperties(properties(tls, hasText(username) && hasText(password)));
        if (hasText(username) && hasText(password)) {
            mailSender.setUsername(username);
            mailSender.setPassword(password);
        }
        mailSender.getJavaMailProperties().putAll(overrides);
        this.from = from;
        this.replyTo = replyTo;
    }

    /**
     * The JavaMail properties for a TLS setting. {@code none} sets nothing (the dev catcher). {@code starttls} makes the upgrade
     * mandatory, and {@code implicit} connects over TLS from the first byte; both verify the server's certificate and name and
     * refuse anything older than TLS 1.2. Timeouts are the same in every mode.
     */
    static Properties properties(String tls, boolean authenticate) {
        Properties properties = new Properties();
        properties.put("mail.smtp.connectiontimeout", "5000");
        properties.put("mail.smtp.timeout", "10000");
        properties.put("mail.smtp.writetimeout", "10000");
        String mode = tls == null ? "none" : tls.trim().toLowerCase(Locale.ROOT);
        if (authenticate) {
            properties.put("mail.smtp.auth", "true");
        }
        switch (mode) {
            case "starttls" -> {
                properties.put("mail.smtp.starttls.enable", "true");
                properties.put("mail.smtp.starttls.required", "true");
                secure(properties);
            }
            case "implicit" -> {
                properties.put("mail.smtp.ssl.enable", "true");
                secure(properties);
            }
            default -> {
                // none: plain SMTP to a local catcher.
            }
        }
        return properties;
    }

    private static void secure(Properties properties) {
        properties.put("mail.smtp.ssl.checkserveridentity", "true");
        properties.put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");
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
            if (hasText(replyTo)) {
                helper.setReplyTo(replyTo);
            }
            helper.setSubject(singleLine(subject));
            helper.setText(body, false);
            mailSender.send(message);
        } catch (MailException | MessagingException ex) {
            // The cause can name the recipient or the server; the caller records only a fixed reason.
            throw new EmailDeliveryException("The mail server did not accept the message", ex, isPermanent(ex));
        }
    }

    /**
     * True when retrying cannot help: the server refused an address with a 5xx answer, or the address is not an address. A 4xx answer, a
     * timeout, a refused connection or a failed login (which is a setting to fix, not a message to drop) are all worth another attempt.
     */
    static boolean isPermanent(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause() == cause ? null : cause.getCause()) {
            if (cause instanceof AddressException) {
                return true;
            }
            if (cause instanceof SMTPAddressFailedException address) {
                return address.getReturnCode() >= 500 && address.getReturnCode() < 600;
            }
            if (cause instanceof SMTPSendFailedException send) {
                return send.getReturnCode() >= 500 && send.getReturnCode() < 600;
            }
        }
        return false;
    }

    /** A header value must be one line: a CR or LF in it is how a header gets injected. */
    static String singleLine(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n]+", " ").trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
