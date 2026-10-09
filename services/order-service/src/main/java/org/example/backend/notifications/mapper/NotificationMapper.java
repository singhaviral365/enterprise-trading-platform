package org.example.backend.notifications.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.example.backend.notifications.model.DeliveryStatus;
import org.example.backend.notifications.model.NewNotification;
import org.example.backend.notifications.model.Notification;
import org.example.backend.notifications.model.QueuedEmail;
import org.example.backend.preferences.model.NotificationChannel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface NotificationMapper {

    /**
     * Inserts the notification unless one with the same {@code eventKey} exists. The key makes a replayed event a
     * no-op, and the decision is the database's, so two consumers racing on the same event cannot both insert.
     *
     * @return 1 if inserted (the generated id is written into {@code notification}), 0 if the event was already recorded
     */
    int insertNotificationIfNew(NewNotification notification);

    /** One delivery row for a non-in-app channel. */
    int insertDelivery(
            @Param("notificationId") long notificationId,
            @Param("channel") NotificationChannel channel,
            @Param("status") DeliveryStatus status,
            @Param("detail") String detail);

    /**
     * The inbox page: this account's in-app notifications. {@code includeUnread} and {@code includeRead} choose the read
     * states; when {@code readCutoff} is set, a read notification is listed only if it was read after it (null: no limit).
     * {@code from} and {@code to} bound {@code created_at} inclusively (null: unbounded). {@code pattern} is a ready-made
     * LIKE pattern (already escaped), or null for no text filter.
     */
    List<Notification> selectInbox(
            @Param("accountId") long accountId,
            @Param("includeUnread") boolean includeUnread,
            @Param("includeRead") boolean includeRead,
            @Param("readCutoff") OffsetDateTime readCutoff,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to,
            @Param("pattern") String pattern,
            @Param("categories") List<String> categories,
            @Param("limit") int limit,
            @Param("offset") long offset);

    long countInbox(
            @Param("accountId") long accountId,
            @Param("includeUnread") boolean includeUnread,
            @Param("includeRead") boolean includeRead,
            @Param("readCutoff") OffsetDateTime readCutoff,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to,
            @Param("pattern") String pattern,
            @Param("categories") List<String> categories);

    long countUnread(@Param("accountId") long accountId);

    /** Sets {@code read_at} if it is not set yet. Scoped by account in the statement, never by the id alone. */
    int markRead(
            @Param("accountId") long accountId,
            @Param("notificationId") long notificationId,
            @Param("readAt") OffsetDateTime readAt);

    Optional<Notification> selectInboxEntry(
            @Param("accountId") long accountId,
            @Param("notificationId") long notificationId);

    /** Queued email deliveries, oldest first, locked so a second dispatcher skips them. */
    List<QueuedEmail> selectQueuedEmails(@Param("limit") int limit);

    int updateDelivery(
            @Param("deliveryId") long deliveryId,
            @Param("status") DeliveryStatus status,
            @Param("detail") String detail);

    /** The email held on the account row, if one was given when the account was opened. */
    Optional<String> selectAccountEmail(@Param("accountId") long accountId);
}
