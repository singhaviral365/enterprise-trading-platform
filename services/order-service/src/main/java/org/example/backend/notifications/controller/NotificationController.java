package org.example.backend.notifications.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Min;
import org.example.backend.notifications.dto.NotificationPageResponse;
import org.example.backend.notifications.dto.NotificationResponse;
import org.example.backend.notifications.model.InboxStatus;
import org.example.backend.notifications.service.NotificationInboxService;
import org.example.backend.preferences.model.NotificationCategory;
import org.example.backend.security.AuthContext;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * The customer's inbox. There is no route that creates a notification: handing one over is the in-process
 * {@code NotificationGateway}, which a customer's token cannot reach.
 */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/notifications")
@Validated
public class NotificationController {

    private final NotificationInboxService inbox;

    public NotificationController(NotificationInboxService inbox) {
        this.inbox = inbox;
    }

    @GetMapping
    public NotificationPageResponse list(
            @PathVariable("accountId") @Min(1) long accountId,
            @RequestParam(name = "q", required = false) String query,
            @RequestParam(name = "category", required = false) List<NotificationCategory> categories,
            @RequestParam(name = "status", required = false) List<InboxStatus> statuses,
            @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "10") int size,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return inbox.list(userId, accountId, query, categories, statuses, from, to, page, size);
    }

    @PostMapping("/{notificationId}/read")
    public NotificationResponse markRead(
            @PathVariable("accountId") @Min(1) long accountId,
            @PathVariable("notificationId") @Min(1) long notificationId,
            HttpServletRequest httpServletRequest) {

        long userId = AuthContext.requiredUserId(httpServletRequest);
        return inbox.markRead(userId, accountId, notificationId);
    }
}
