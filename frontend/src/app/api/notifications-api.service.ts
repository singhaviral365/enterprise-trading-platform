import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Notification, NotificationCategory, NotificationPage, NotificationsService } from './generated/notifications';

export interface InboxQuery {
  /** Text to look for in the title or message. */
  q?: string;
  /** Only these categories; empty or omitted means all. */
  categories?: readonly NotificationCategory[];
  /** Zero-based page, as the API counts. */
  page?: number;
  size?: number;
}

/**
 * App-facing wrapper over the generated Notifications client (the notifications module of the Trade REST API).
 * The generated service exposes observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly notifications = inject(NotificationsService);

  list(accountId: number, query: InboxQuery = {}): Observable<NotificationPage> {
    const categories = query.categories?.length ? [...query.categories] : undefined;
    return this.notifications.listNotifications(accountId, query.q || undefined, categories, query.page, query.size);
  }

  markRead(accountId: number, notificationId: number): Observable<Notification> {
    return this.notifications.markNotificationRead(accountId, notificationId);
  }
}
