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
import org.example.backend.preferences.model.NotificationChannel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationInboxServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-06T09:00:00Z");

    private NotificationMapper mapper;
    private AccountMapper accountMapper;
    private NotificationInboxService service;

    @BeforeEach
    void setUp() {
        mapper = mock(NotificationMapper.class);
        accountMapper = mock(AccountMapper.class);
        service = new NotificationInboxService(mapper, accountMapper, Duration.ofHours(1), Clock.fixed(NOW, ZoneOffset.UTC));

        // Account 5 exists and belongs to user 7.
        when(accountMapper.accountExists(5)).thenReturn(true);
        when(accountMapper.selectAccountLinkedUserId(5)).thenReturn(7);
    }

    private static Notification sample(long id, OffsetDateTime readAt) {
        return new Notification(id, 5, NotificationCategory.ORDER_STATUS, "Order filled", "Your buy order was filled.",
                "IN_APP,EMAIL", T0, readAt);
    }

    @Test
    void anOwnerReadsTheirInboxWithTheUnreadCount() {
        when(mapper.countInbox(eq(5L), anyBoolean(), anyBoolean(), any(), any(), any(), any(), any())).thenReturn(23L);
        when(mapper.selectInbox(eq(5L), anyBoolean(), anyBoolean(), any(), any(), any(), any(), any(), eq(10), eq(0L))).thenReturn(List.of(sample(42, null)));
        when(mapper.countUnread(5)).thenReturn(5L);

        NotificationPageResponse page = service.list(7, 5, null, null, null, null, null, 0, 10);

        assertEquals(1, page.items().size());
        assertEquals(42, page.items().get(0).notificationId());
        assertEquals(List.of(NotificationChannel.IN_APP, NotificationChannel.EMAIL), page.items().get(0).channels());
        assertEquals(23, page.totalItems());
        assertEquals(3, page.totalPages());
        assertEquals(5, page.unreadCount());
    }

    @Test
    void historyIsRefusedToAnAccountThatDoesNotOwnIt() {
        // User 8 holds a valid token but account 5 is user 7's.
        assertThrows(NotificationAccessDeniedException.class, () -> service.list(8, 5, null, null, null, null, null, 0, 10));
        assertThrows(NotificationAccessDeniedException.class, () -> service.markRead(8, 5, 42));

        verify(mapper, never()).selectInbox(anyLong(), anyBoolean(), anyBoolean(), any(), any(), any(), any(), any(), anyInt(), anyLong());
        verify(mapper, never()).markRead(anyLong(), anyLong(), any());
    }

    @Test
    void anUnknownAccountIsNotFound() {
        assertThrows(AccountNotFoundException.class, () -> service.list(7, 99, null, null, null, null, null, 0, 10));
    }

    @Test
    void theReadCutoffIsOneHourBack() {
        service.list(7, 5, null, null, null, null, null, 0, 10);

        ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(mapper).countInbox(eq(5L), eq(true), eq(true), cutoff.capture(), any(), any(), any(), any());
        assertEquals(OffsetDateTime.parse("2026-10-06T09:00:00Z"), cutoff.getValue());
    }

    @Test
    void categoriesAreCarriedToTheQueryAndSecondPagesOffsetCorrectly() {
        service.list(7, 5, null, List.of(NotificationCategory.WATCHLIST_ALERTS), null, null, null, 2, 10);

        verify(mapper).selectInbox(eq(5L), anyBoolean(), anyBoolean(), any(), any(), any(), any(), eq(List.of("WATCHLIST_ALERTS")), eq(10), eq(20L));
    }

    @Test
    void explicitStatusesDropTheRetentionWindowAndChooseTheReadStates() {
        service.list(7, 5, null, null, List.of(InboxStatus.READ), null, null, 0, 10);
        verify(mapper).countInbox(eq(5L), eq(false), eq(true), isNull(), isNull(), isNull(), any(), any());

        service.list(7, 5, null, null, List.of(InboxStatus.UNREAD, InboxStatus.READ), null, null, 0, 10);
        verify(mapper).countInbox(eq(5L), eq(true), eq(true), isNull(), isNull(), isNull(), any(), any());

        service.list(7, 5, null, null, List.of(InboxStatus.UNREAD), null, null, 0, 10);
        verify(mapper).countInbox(eq(5L), eq(true), eq(false), isNull(), isNull(), isNull(), any(), any());
    }

    @Test
    void theDateRangeIsCarriedToTheQuery() {
        OffsetDateTime from = OffsetDateTime.parse("2026-09-01T00:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-09-30T23:59:59Z");

        service.list(7, 5, null, null, List.of(InboxStatus.UNREAD), from, to, 0, 10);

        verify(mapper).selectInbox(eq(5L), eq(true), eq(false), isNull(), eq(from), eq(to), any(), any(), eq(10), eq(0L));
    }

    @Test
    void anInvertedOrOverlongDateRangeIsRefused() {
        OffsetDateTime from = OffsetDateTime.parse("2026-09-30T00:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-09-01T00:00:00Z");
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, null, null, null, from, to, 0, 10));

        OffsetDateTime start = OffsetDateTime.parse("2025-01-01T00:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-09-01T00:00:00Z");
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, null, null, null, start, end, 0, 10));

        OffsetDateTime exactly = start.plusDays(366);
        service.list(7, 5, null, null, null, start, exactly, 0, 10);
    }

    @Test
    void theUnreadCountIsTheAccountTotalWhateverWasFiltered() {
        when(mapper.countUnread(5)).thenReturn(9L);

        NotificationPageResponse page = service.list(7, 5, "AAPL", null, List.of(InboxStatus.READ), null, null, 0, 10);

        assertEquals(9, page.unreadCount());
    }

    @Test
    void searchTextBecomesAnEscapedLiteralPattern() {
        assertEquals("%AAPL%", NotificationInboxService.likePattern("  AAPL "));
        assertEquals("%50\\%%", NotificationInboxService.likePattern("50%"));
        assertEquals("%a\\_b%", NotificationInboxService.likePattern("a_b"));
        assertEquals("%a\\\\b%", NotificationInboxService.likePattern("a\\b"));
        assertNull(NotificationInboxService.likePattern("   "));
        assertNull(NotificationInboxService.likePattern(null));
    }

    @Test
    void theSearchPatternIsPassedAsABoundValueNotConcatenated() {
        service.list(7, 5, "x' OR '1'='1", null, null, null, null, 0, 10);

        ArgumentCaptor<String> pattern = ArgumentCaptor.forClass(String.class);
        verify(mapper).countInbox(eq(5L), anyBoolean(), anyBoolean(), any(), any(), any(), pattern.capture(), any());
        assertEquals("%x' OR '1'='1%", pattern.getValue());
    }

    @Test
    void pagingIsValidated() {
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, null, null, null, null, null, -1, 10));
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, null, null, null, null, null, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, null, null, null, null, null, 0, 51));
        assertThrows(IllegalArgumentException.class, () -> service.list(7, 5, "x".repeat(101), null, null, null, null, 0, 10));
    }

    @Test
    void markingReadReturnsTheNotificationWithItsReadTime() {
        OffsetDateTime read = OffsetDateTime.parse("2026-10-06T10:00:00Z");
        when(mapper.selectInboxEntry(5, 42)).thenReturn(Optional.of(sample(42, read)));

        NotificationResponse response = service.markRead(7, 5, 42);

        verify(mapper).markRead(eq(5L), eq(42L), eq(read));
        assertEquals(read, response.readAt());
    }

    @Test
    void aNotificationOfAnotherAccountIsNotFoundSoItsIdIsNotRevealed() {
        // The SQL is scoped to the account, so another account's id simply matches nothing.
        when(mapper.selectInboxEntry(5, 777)).thenReturn(Optional.empty());

        assertThrows(NotificationNotFoundException.class, () -> service.markRead(7, 5, 777));
    }
}
