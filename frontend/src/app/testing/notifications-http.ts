import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

/** Shared helpers for specs that sit on top of the notification inbox. Test-only: excluded from the app build. */

export const NOTIFICATIONS_URL = '/api/v1/accounts/1001/notifications';

export function notification(id: number, over: Record<string, unknown> = {}) {
  return {
    notificationId: id,
    category: 'ORDER_STATUS',
    title: `Order filled ${id}`,
    message: `Your buy order for 10 AAPL was filled at 189.50 (${id}).`,
    createdAt: '2026-10-06T09:00:00Z',
    readAt: null,
    channels: ['IN_APP'],
    ...over,
  };
}

export function inboxPage(items: object[], over: Record<string, unknown> = {}) {
  return { items, page: 0, size: 5, totalItems: items.length, totalPages: 1, unreadCount: items.length, ...over };
}

/** Waits for the next inbox read, answers it, and returns the request so the test can look at its parameters. */
export async function answerInbox(http: HttpTestingController, body: object): Promise<TestRequest> {
  const request = await vi.waitFor(() =>
    http.expectOne((r) => r.method === 'GET' && r.url === NOTIFICATIONS_URL),
  );
  request.flush(body);
  return request;
}
