import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../api/api.config';
import { NotificationCategory } from '../api/generated/notifications';
import { NOTIFICATIONS_URL, answerInbox, inboxPage, notification } from '../testing/notifications-http';
import { TEST_TOKENS, answerLinkedAccount, answerUnlinkedAccount } from '../testing/trade-http';
import { INBOX_REFRESH_MS, NotificationInboxStore, READ_RETENTION_MS } from './notification-inbox.store';
import { NotificationService } from './notification.service';
import { SessionService } from './session.service';

/** "Read a moment ago": a fixed timestamp would fall outside the one-hour retention window as the real clock moves on. */
const READ_NOW = new Date().toISOString();

describe('NotificationInboxStore', () => {
  let store: NotificationInboxStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    });
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(NotificationInboxStore);
  });

  afterEach(() => http.verify());

  /** The account loads first, then the inbox for it. */
  async function load(body: object = inboxPage([notification(1), notification(2)], { unreadCount: 7, totalItems: 12, totalPages: 3 })) {
    await answerLinkedAccount(http);
    return answerInbox(http, body);
  }

  it('reads the first page, newest first as the server sends it, with the account unread count', async () => {
    const request = await load();

    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('5');
    await vi.waitFor(() => expect(store.items().map((n) => n.notificationId)).toEqual([1, 2]));
    expect(store.unreadCount()).toBe(7);
    expect(store.totalItems()).toBe(12);
    expect(store.totalPages()).toBe(3);
  });

  it('does nothing for an account that is not open yet, so there is no request and no badge', async () => {
    await answerUnlinkedAccount(http);
    await TestBed.inject(NotificationInboxStore).data.reload();

    http.expectNone((r) => r.url === NOTIFICATIONS_URL);
    expect(store.unreadCount()).toBe(0);
    expect(store.items()).toEqual([]);
  });

  it('searches, filters and pages by asking the server, and goes back to page 1 when a filter changes', async () => {
    await load();
    store.page.set(3);

    store.setQuery('  AAPL ');
    const search = await answerInbox(http, inboxPage([notification(3)]));
    expect(search.request.params.get('q')).toBe('AAPL');
    expect(search.request.params.get('page')).toBe('0');
    expect(store.page()).toBe(1);

    store.setCategories([NotificationCategory.WatchlistAlerts]);
    const filtered = await answerInbox(http, inboxPage([]));
    expect(filtered.request.params.getAll('category')).toEqual(['WATCHLIST_ALERTS']);

    store.page.set(2);
    const paged = await answerInbox(http, inboxPage([]));
    expect(paged.request.params.get('page')).toBe('1');

    store.setPageSize(25);
    const sized = await answerInbox(http, inboxPage([]));
    expect(sized.request.params.get('size')).toBe('25');
    expect(sized.request.params.get('page')).toBe('0');
  });

  it('marks a notification read, shows it read at once and lowers the badge by one', async () => {
    await load();
    await vi.waitFor(() => expect(store.items()).toHaveLength(2));

    const marking = store.markRead(store.items()[0]);
    const post = await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` }));
    post.flush(notification(1, { readAt: READ_NOW }));
    await marking;

    expect(store.items()[0].readAt).toBe(READ_NOW);
    expect(store.items()[1].readAt).toBeNull();
    expect(store.unreadCount()).toBe(6);
  });

  it('marking an already read notification sends nothing', async () => {
    await load(inboxPage([notification(1, { readAt: new Date().toISOString() })]));
    await vi.waitFor(() => expect(store.items()).toHaveLength(1));

    await store.markRead(store.items()[0]);

    http.expectNone({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` });
  });

  it('marking the same notification twice in a row sends one request', async () => {
    await load();
    await vi.waitFor(() => expect(store.items()).toHaveLength(2));

    const first = store.markRead(store.items()[0]);
    (await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` }))).flush(
      notification(1, { readAt: READ_NOW }),
    );
    await first;
    await store.markRead(store.items()[0]);

    http.expectNone({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` });
    expect(store.unreadCount()).toBe(6);
  });

  it('shows a failure to mark read and changes nothing', async () => {
    await load();
    await vi.waitFor(() => expect(store.items()).toHaveLength(2));
    const toasts = TestBed.inject(NotificationService);

    const marking = store.markRead(store.items()[0]);
    (await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` }))).flush(
      { errorCode: 'NTF-404', message: 'x' },
      { status: 404, statusText: 'x' },
    );
    await marking;

    expect(toasts.notifications().length).toBe(1);
    expect(store.items()[0].readAt).toBeNull();
    expect(store.unreadCount()).toBe(7);
  });

  it('drops a notification that was read more than an hour ago, and keeps one read a moment ago', async () => {
    const longAgo = new Date(Date.now() - READ_RETENTION_MS - 60_000).toISOString();
    const justNow = new Date(Date.now() - 60_000).toISOString();
    await load(inboxPage([notification(1, { readAt: longAgo }), notification(2, { readAt: justNow }), notification(3)]));

    await vi.waitFor(() => expect(store.items().map((n) => n.notificationId)).toEqual([2, 3]));
  });

  it('never lets the badge go below zero', async () => {
    await load(inboxPage([notification(1)], { unreadCount: 0 }));
    await vi.waitFor(() => expect(store.items()).toHaveLength(1));

    const marking = store.markRead(store.items()[0]);
    (await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` }))).flush(
      notification(1, { readAt: READ_NOW }),
    );
    await marking;

    expect(store.unreadCount()).toBe(0);
  });

  it('reports a failed read in words, and keeps the last page when a refresh fails', async () => {
    await answerLinkedAccount(http);
    const first = await vi.waitFor(() => http.expectOne((r) => r.url === NOTIFICATIONS_URL));
    first.flush(null, { status: 500, statusText: 'x' });

    await vi.waitFor(() => expect(store.errorMessage()).not.toBe(''));
  });

  it('refreshes by itself on a timer so the badge follows new fills and fired alerts', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await load();
      await vi.waitFor(() => expect(store.items()).toHaveLength(2));

      vi.advanceTimersByTime(INBOX_REFRESH_MS);
      await answerInbox(http, inboxPage([notification(9)], { unreadCount: 8 }));

      await vi.waitFor(() => expect(store.unreadCount()).toBe(8));
    } finally {
      vi.useRealTimers();
    }
  });
});
