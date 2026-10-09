package org.example.backend.notifications.email;

import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.QueuedEmail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Sends the queued email deliveries, off the Kafka thread. The consumer commits its offset once a notification is
 * durably recorded; whether a mail server is having a bad afternoon is decided here, later, and cannot stall a
 * partition or back up other accounts.
 *
 * <p>A delivery moves QUEUED to SENT, or stays QUEUED with its attempt count raised until {@code max-attempts}, then
 * FAILED. How a failure is treated depends on whether retrying could help:
 * <ul>
 *   <li><b>permanent</b> (the server refused the address for good, a 5xx answer): FAILED at once, no retry;</li>
 *   <li><b>transient</b> (a 4xx answer, a timeout, a refused connection): QUEUED again, until the attempts run out.</li>
 * </ul>
 * A delivery is SKIPPED, never failed, when there is nowhere to send it (no address on file), when email is off, or when the
 * address is not on this deployment's recipient allow-list ({@code RECIPIENT_NOT_ALLOWED}): none of those is a fault that retrying
 * would fix. Rows are locked with {@code SKIP LOCKED}, so a second dispatcher passes over them.
 *
 * <p>{@code max-per-minute} caps how many messages one minute may send, to stay under a provider's quota. Once it is reached the rest
 * of the batch is left QUEUED for the next sweep, untouched.
 */
@Component
public class EmailDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(EmailDispatcher.class);
    private static final Duration WINDOW = Duration.ofMinutes(1);

    static final String NOT_ENABLED = "Email is not enabled in this environment";
    static final String NO_ADDRESS = "No email address on file";
    static final String NOT_ALLOWED = "RECIPIENT_NOT_ALLOWED";
    static final String REFUSED = "The mail server did not accept the message";
    static final String ADDRESS_REFUSED = "The mail server refused the address";

    private final NotificationMapper mapper;
    private final EmailSender emailSender;
    private final int batchSize;
    private final int maxAttempts;
    private final int maxPerMinute;
    private final List<String> allowedDomains;
    private final Clock clock;

    private Instant windowStart;
    private int sentInWindow;

    @Autowired
    public EmailDispatcher(
            NotificationMapper mapper,
            EmailSender emailSender,
            @Value("${notifications.email.dispatch.batch-size:20}") int batchSize,
            @Value("${notifications.email.dispatch.max-attempts:3}") int maxAttempts,
            @Value("${notifications.email.dispatch.max-per-minute:0}") int maxPerMinute,
            @Value("${notifications.email.allowed-recipient-domains:}") String allowedDomains) {
        this(mapper, emailSender, batchSize, maxAttempts, maxPerMinute, EmailEnvironmentGuard.domains(allowedDomains), Clock.systemUTC());
    }

    public EmailDispatcher(NotificationMapper mapper, EmailSender emailSender, int batchSize, int maxAttempts) {
        this(mapper, emailSender, batchSize, maxAttempts, 0, List.of(), Clock.systemUTC());
    }

    EmailDispatcher(
            NotificationMapper mapper,
            EmailSender emailSender,
            int batchSize,
            int maxAttempts,
            int maxPerMinute,
            List<String> allowedDomains,
            Clock clock) {
        this.mapper = mapper;
        this.emailSender = emailSender;
        this.batchSize = Math.max(1, batchSize);
        this.maxAttempts = Math.max(1, maxAttempts);
        this.maxPerMinute = Math.max(0, maxPerMinute);
        this.allowedDomains = allowedDomains;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${notifications.email.dispatch.interval-millis:5000}")
    @Transactional
    public void dispatchQueued() {
        dispatchBatch();
    }

    /** @return how many deliveries were looked at */
    public int dispatchBatch() {
        List<QueuedEmail> queued = mapper.selectQueuedEmails(batchSize);
        int looked = 0;
        for (QueuedEmail email : queued) {
            if (!dispatch(email)) {
                break;
            }
            looked++;
        }
        return looked;
    }

    /** @return false when the per-minute cap stopped the batch (this delivery and the rest stay queued) */
    private boolean dispatch(QueuedEmail email) {
        if (!emailSender.enabled()) {
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SKIPPED, NOT_ENABLED);
            return true;
        }
        if (email.recipient() == null || email.recipient().isBlank()) {
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SKIPPED, NO_ADDRESS);
            return true;
        }
        if (!allowedRecipient(email.recipient())) {
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SKIPPED, NOT_ALLOWED);
            LOGGER.info("Email delivery {} skipped: the recipient's domain is not on the allow-list", email.deliveryId());
            return true;
        }
        if (!roomInThisMinute()) {
            LOGGER.info("Email sending paused for this minute: {} messages is the cap", maxPerMinute);
            return false;
        }
        try {
            emailSender.send(email.recipient(), email.title(), body(email));
            sentInWindow++;
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SENT, null);
        } catch (RuntimeException ex) {
            sentInWindow++;
            boolean permanent = ex instanceof EmailDeliveryException delivery && delivery.isPermanent();
            boolean exhausted = email.attempts() + 1 >= maxAttempts;
            mapper.updateDelivery(
                    email.deliveryId(),
                    permanent || exhausted ? DeliveryStatus.FAILED : DeliveryStatus.QUEUED,
                    permanent ? ADDRESS_REFUSED : REFUSED);
            // The delivery id and the reason class only: never the address, never the message text.
            LOGGER.warn("Email delivery {} not sent (attempt {} of {}, {}): {}",
                    email.deliveryId(), email.attempts() + 1, maxAttempts, permanent ? "permanent" : "will retry",
                    ex.getClass().getSimpleName());
        }
        return true;
    }

    /** With no allow-list every address is allowed; with one, only addresses on a listed domain; {@code *} means anyone, said on purpose. */
    private boolean allowedRecipient(String recipient) {
        return allowedDomains.isEmpty() || allowedDomains.contains("*") || allowedDomains.contains(EmailEnvironmentGuard.domainOf(recipient));
    }

    /** A fixed one-minute window: it opens at the first send and a new one starts when it has passed. 0 means no cap. */
    private boolean roomInThisMinute() {
        if (maxPerMinute == 0) {
            return true;
        }
        Instant now = clock.instant();
        if (windowStart == null || !now.isBefore(windowStart.plus(WINDOW))) {
            windowStart = now;
            sentInWindow = 0;
        }
        return sentInWindow < maxPerMinute;
    }

    static String body(QueuedEmail email) {
        return email.message()
                + "\n\n--\nYou are receiving this because Email is one of your notification channels in Settings.";
    }
}
