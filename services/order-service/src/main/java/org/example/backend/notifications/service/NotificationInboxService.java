package org.example.backend.notifications.service;

import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.mapper.AccountMapper;
import org.example.backend.notifications.dto.NotificationPageResponse;
import org.example.backend.notifications.dto.NotificationResponse;
import org.example.backend.notifications.exceptions.NotificationAccessDeniedException;
import org.example.backend.notifications.exceptions.NotificationNotFoundException;
import org.example.backend.notifications.mapper.NotificationMapper;
import org.example.backend.notifications.model.InboxStatus;
import org.example.backend.notifications.model.Notification;
import org.example.backend.preferences.model.NotificationCategory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * What the customer's inbox does. Every public method starts with {@link #assertAccountAccess}: the verified token's
 * user must own the account being addressed, and every query after that is scoped to that account in the SQL itself,
 * never to an identifier the client supplied on its own. A notification that exists but belongs to another account is
 * reported as not found, so ids in use are not revealed.
 */
@Service
public class NotificationInboxService {

    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_QUERY_LENGTH = 100;
    static final Duration MAX_DATE_RANGE = Duration.ofDays(366);

    private final NotificationMapper mapper;
    private final AccountMapper accountMapper;
    private final Duration readRetention;
    private final Clock clock;

    @Autowired
    public NotificationInboxService(
            NotificationMapper mapper,
            AccountMapper accountMapper,
            @Value("${notifications.inbox.read-retention-minutes:60}") long readRetentionMinutes) {
        this(mapper, accountMapper, Duration.ofMinutes(readRetentionMinutes), Clock.systemUTC());
    }

    NotificationInboxService(NotificationMapper mapper, AccountMapper accountMapper, Duration readRetention, Clock clock) {
        this.mapper = mapper;
        this.accountMapper = accountMapper;
        this.readRetention = readRetention;
        this.clock = clock;
    }

    /**
     * One page of the inbox.
     *
     * <p>Without {@code statuses} (the original call) the list holds the unread notifications and the ones read within
     * the retention window. With {@code statuses} the customer chose: UNREAD and/or READ, and the retention window no
     * longer limits what READ returns. {@code from} and {@code to} (both inclusive, optional) bound the created time.
     * {@code unreadCount} is always the account's total, whatever was filtered, because the bell reads it.
     */
    public NotificationPageResponse list(
            long userId,
            long accountId,
            String query,
            List<NotificationCategory> categories,
            List<InboxStatus> statuses,
            OffsetDateTime from,
            OffsetDateTime to,
            int page,
            int size) {

        assertAccountAccess(userId, accountId);
        if (page < 0) {
            throw new IllegalArgumentException("Page cannot be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("Page size must be between 1 and " + MAX_PAGE_SIZE);
        }
        if (from != null && to != null) {
            if (from.isAfter(to)) {
                throw new IllegalArgumentException("'from' cannot be after 'to'");
            }
            if (Duration.between(from.toInstant(), to.toInstant()).compareTo(MAX_DATE_RANGE) > 0) {
                throw new IllegalArgumentException("The date range cannot exceed 366 days");
            }
        }

        String pattern = likePattern(query);
        List<String> categoryNames = categories == null ? List.of() : categories.stream().map(Enum::name).distinct().toList();
        boolean explicit = statuses != null && !statuses.isEmpty();
        boolean includeUnread = !explicit || statuses.contains(InboxStatus.UNREAD);
        boolean includeRead = !explicit || statuses.contains(InboxStatus.READ);
        // The retention window only applies to the original call; asking for READ explicitly means all of them.
        OffsetDateTime readCutoff = explicit ? null : OffsetDateTime.now(clock).minus(readRetention);

        long total = mapper.countInbox(accountId, includeUnread, includeRead, readCutoff, from, to, pattern, categoryNames);
        List<NotificationResponse> items = mapper
                .selectInbox(accountId, includeUnread, includeRead, readCutoff, from, to, pattern, categoryNames, size, (long) page * size)
                .stream()
                .map(NotificationResponse::from)
                .toList();

        return new NotificationPageResponse(
                items,
                page,
                size,
                total,
                (int) Math.ceil(total / (double) size),
                mapper.countUnread(accountId));
    }

    public NotificationResponse markRead(long userId, long accountId, long notificationId) {
        assertAccountAccess(userId, accountId);

        mapper.markRead(accountId, notificationId, OffsetDateTime.now(clock));
        Notification notification = mapper.selectInboxEntry(accountId, notificationId)
                .orElseThrow(() -> new NotificationNotFoundException(notificationId));

        return NotificationResponse.from(notification);
    }

    /**
     * Turns what the customer typed into a LIKE pattern that matches it literally: {@code %}, {@code _} and the escape
     * character itself are escaped, so a search for "50%" finds "50%" and not everything. Null for no text filter.
     */
    static String likePattern(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String trimmed = query.trim();
        if (trimmed.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException("Search text cannot exceed " + MAX_QUERY_LENGTH + " characters");
        }
        return "%" + trimmed.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /** Unknown account is {@code ACC-404}; an account the token's user does not own is {@code ACC-403}. */
    private void assertAccountAccess(long userId, long accountId) {
        int accountIdInt = Math.toIntExact(accountId);

        if (!accountMapper.accountExists(accountIdInt)) {
            throw new AccountNotFoundException(accountId);
        }

        Integer linkedUserId = accountMapper.selectAccountLinkedUserId(accountIdInt);
        if (linkedUserId == null || linkedUserId != Math.toIntExact(userId)) {
            throw new NotificationAccessDeniedException(accountId);
        }
    }
}
