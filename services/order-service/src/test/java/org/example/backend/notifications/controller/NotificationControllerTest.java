package org.example.backend.notifications.controller;

import org.example.backend.controller.ApiExceptionHandler;
import org.example.backend.exceptions.AccountNotFoundException;
import org.example.backend.notifications.dto.NotificationPageResponse;
import org.example.backend.notifications.dto.NotificationResponse;
import org.example.backend.notifications.exceptions.NotificationAccessDeniedException;
import org.example.backend.notifications.exceptions.NotificationNotFoundException;
import org.example.backend.notifications.service.NotificationInboxService;
import org.example.backend.notifications.model.InboxStatus;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.preferences.model.NotificationChannel;
import org.example.backend.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NotificationControllerTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-06T09:00:00Z");

    private NotificationInboxService inbox;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        inbox = mock(NotificationInboxService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new NotificationController(inbox))
                .setControllerAdvice(new NotificationExceptionHandler(), new ApiExceptionHandler())
                .build();
    }

    private static NotificationResponse sample() {
        return new NotificationResponse(42, NotificationCategory.ORDER_STATUS, "Order filled", "Your buy order was filled.",
                T0, null, List.of(NotificationChannel.IN_APP));
    }

    @Test
    void listReturnsThePageForTheAuthenticatedUser() throws Exception {
        when(inbox.list(eq(7L), eq(5L), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new NotificationPageResponse(List.of(sample()), 0, 10, 1, 1, 1));

        mockMvc.perform(get("/api/v1/accounts/5/notifications")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].notificationId").value(42))
                .andExpect(jsonPath("$.items[0].category").value("ORDER_STATUS"))
                .andExpect(jsonPath("$.items[0].channels[0]").value("IN_APP"))
                .andExpect(jsonPath("$.unreadCount").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    void filtersSearchAndPagingReachTheService() throws Exception {
        when(inbox.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new NotificationPageResponse(List.of(), 2, 5, 0, 0, 0));

        mockMvc.perform(get("/api/v1/accounts/5/notifications")
                        .param("q", "AAPL")
                        .param("category", "ORDER_STATUS", "WATCHLIST_ALERTS")
                        .param("page", "2")
                        .param("size", "5")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk());

        verify(inbox).list(7L, 5L, "AAPL",
                List.of(NotificationCategory.ORDER_STATUS, NotificationCategory.WATCHLIST_ALERTS), null, null, null, 2, 5);
    }

    @Test
    void statusAndDateRangeReachTheService() throws Exception {
        when(inbox.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new NotificationPageResponse(List.of(), 0, 10, 0, 0, 0));

        mockMvc.perform(get("/api/v1/accounts/5/notifications")
                        .param("status", "UNREAD", "READ")
                        .param("from", "2026-09-01T00:00:00Z")
                        .param("to", "2026-09-30T23:59:59Z")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk());

        verify(inbox).list(7L, 5L, null, null,
                List.of(InboxStatus.UNREAD, InboxStatus.READ),
                OffsetDateTime.parse("2026-09-01T00:00:00Z"), OffsetDateTime.parse("2026-09-30T23:59:59Z"), 0, 10);
    }

    @Test
    void markReadReturnsTheNotification() throws Exception {
        when(inbox.markRead(7L, 5L, 42L)).thenReturn(sample());

        mockMvc.perform(post("/api/v1/accounts/5/notifications/42/read")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notificationId").value(42));
    }

    @Test
    void anotherUsersAccountIs403() throws Exception {
        when(inbox.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenThrow(new NotificationAccessDeniedException(5));

        mockMvc.perform(get("/api/v1/accounts/5/notifications")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 8L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
    }

    @Test
    void anUnknownAccountIs404() throws Exception {
        when(inbox.list(anyLong(), anyLong(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenThrow(new AccountNotFoundException(99));

        mockMvc.perform(get("/api/v1/accounts/99/notifications")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void aNotificationThatIsNotThisAccountsIs404WithTheNotificationCode() throws Exception {
        when(inbox.markRead(anyLong(), anyLong(), anyLong())).thenThrow(new NotificationNotFoundException(777));

        mockMvc.perform(post("/api/v1/accounts/5/notifications/777/read")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("NTF-404"));
    }

    @Test
    void thereIsNoRouteThatCreatesANotification() throws Exception {
        mockMvc.perform(post("/api/v1/accounts/5/notifications")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L)
                        .contentType("application/json")
                        .content("{\"title\":\"x\",\"message\":\"y\"}"))
                .andExpect(status().is(org.hamcrest.Matchers.greaterThanOrEqualTo(400)));
        mockMvc.perform(put("/api/v1/accounts/5/notifications/42")
                        .requestAttr(AuthContext.USER_ID_ATTRIBUTE, 7L))
                .andExpect(status().is(org.hamcrest.Matchers.greaterThanOrEqualTo(400)));
    }
}
