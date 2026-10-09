package org.example.backend.notifications.email;

/**
 * The only thing the notifications module knows about email. Today the one real implementation is
 * {@link SmtpEmailSender}, which exists only in a development environment (see {@link DevOnlyEmailGuard}); in every
 * other environment the {@link DisabledEmailSender} is what is wired, and an email delivery is recorded as skipped
 * rather than sent.
 *
 * <p>There is no address parameter that a customer controls: the recipient is the address held for the account, and the
 * server it is sent through comes from configuration, never from a request. That is what keeps this free of
 * server-side request forgery.
 */
public interface EmailSender {

    /** False when email is switched off in this environment: nothing is queued for it and nothing is attempted. */
    boolean enabled();

    /**
     * Sends one plain-text message.
     *
     * @throws EmailDeliveryException if the provider could not accept it
     */
    void send(String to, String subject, String body);
}
