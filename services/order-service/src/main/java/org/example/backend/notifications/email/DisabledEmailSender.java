package org.example.backend.notifications.email;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * What is wired unless email is explicitly switched on (the default, and so what every non-development environment
 * gets). It sends nothing; the notifications module records the email delivery as {@code SKIPPED}.
 */
@Component
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "false", matchIfMissing = true)
public class DisabledEmailSender implements EmailSender {

    @Override
    public boolean enabled() {
        return false;
    }

    @Override
    public void send(String to, String subject, String body) {
        throw new IllegalStateException("Email is not enabled in this environment");
    }
}
