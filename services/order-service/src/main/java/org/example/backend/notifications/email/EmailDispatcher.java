package org.example.backend.notifications.email;

import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.QueuedEmail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Sends the queued email deliveries, off the Kafka thread. The consumer commits its offset once a notification is
 * durably recorded; whether a mail server is having a bad afternoon is decided here, later, and cannot stall a
 * partition or back up other accounts.
 *
 * <p>A delivery moves QUEUED to SENT, or stays QUEUED with its attempt count raised until {@code max-attempts}, then
 * FAILED. A delivery with no recipient on file is SKIPPED (there is nowhere to send it), never failed: that is not a
 * fault that retrying would fix. Rows are locked with {@code SKIP LOCKED}, so a second dispatcher passes over them.
 */
@Component
public class EmailDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(EmailDispatcher.class);

    private final NotificationMapper mapper;
    private final EmailSender emailSender;
    private final int batchSize;
    private final int maxAttempts;

    public EmailDispatcher(
            NotificationMapper mapper,
            EmailSender emailSender,
            @Value("${notifications.email.dispatch.batch-size:20}") int batchSize,
            @Value("${notifications.email.dispatch.max-attempts:3}") int maxAttempts) {
        this.mapper = mapper;
        this.emailSender = emailSender;
        this.batchSize = Math.max(1, batchSize);
        this.maxAttempts = Math.max(1, maxAttempts);
    }

    @Scheduled(fixedDelayString = "${notifications.email.dispatch.interval-millis:5000}")
    @Transactional
    public void dispatchQueued() {
        dispatchBatch();
    }

    /** @return how many deliveries were looked at */
    public int dispatchBatch() {
        List<QueuedEmail> queued = mapper.selectQueuedEmails(batchSize);
        for (QueuedEmail email : queued) {
            dispatch(email);
        }
        return queued.size();
    }

    private void dispatch(QueuedEmail email) {
        if (!emailSender.enabled()) {
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SKIPPED, "Email is not enabled in this environment");
            return;
        }
        if (email.recipient() == null || email.recipient().isBlank()) {
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SKIPPED, "No email address on file");
            return;
        }
        try {
            emailSender.send(email.recipient(), email.title(), body(email));
            mapper.updateDelivery(email.deliveryId(), DeliveryStatus.SENT, null);
        } catch (RuntimeException ex) {
            boolean exhausted = email.attempts() + 1 >= maxAttempts;
            mapper.updateDelivery(
                    email.deliveryId(),
                    exhausted ? DeliveryStatus.FAILED : DeliveryStatus.QUEUED,
                    "The mail server did not accept the message");
            // The delivery id and the reason class only: never the address, never the message text.
            LOGGER.warn("Email delivery {} not sent (attempt {} of {}): {}",
                    email.deliveryId(), email.attempts() + 1, maxAttempts, ex.getClass().getSimpleName());
        }
    }

    static String body(QueuedEmail email) {
        return email.message()
                + "\n\n--\nYou are receiving this because Email is one of your notification channels in Settings.";
    }
}
