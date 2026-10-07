import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../../api/api.config';
import { SessionService } from '../../core/session.service';
import { NOTIFICATIONS_URL, answerInbox, inboxPage, notification } from '../../testing/notifications-http';
import { TEST_TOKENS, answerLinkedAccount } from '../../testing/trade-http';
import { Notifications } from './notifications';

describe('Notifications page', () => {
  let fixture: ComponentFixture<Notifications>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const rows = () => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="notification-list"] li'));

  async function boot(body: object): Promise<void> {
    await answerLinkedAccount(http);
    await answerInbox(http, body);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Notifications],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(Notifications);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('shows a spinner while the first page loads', async () => {
    await answerLinkedAccount(http);
    // The request being open is what "loading" means.
    const pending = await vi.waitFor(() => http.expectOne((r) => r.url === NOTIFICATIONS_URL));
    fixture.detectChanges();

    expect(byTestId('notification-loading')).not.toBeNull();
    pending.flush(inboxPage([]));
  });

  it('lists the notifications with title, message and time', async () => {
    await boot(inboxPage([notification(1), notification(2, { title: 'Price alert: AAPL', category: 'WATCHLIST_ALERTS' })], { unreadCount: 2 }));

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Order filled 1');
    expect(rows()[0].textContent).toContain('Your buy order for 10 AAPL was filled');
    expect(rows()[1].textContent).toContain('Price alert: AAPL');
    expect(rows()[0].querySelector('time')?.getAttribute('datetime')).toBe('2026-10-06T09:00:00Z');
    expect(byTestId('notification-list')?.getAttribute('aria-label')).toBe('Notifications');
    expect(rows()[0].querySelector('.fa-receipt')).not.toBeNull();
    expect(rows()[1].querySelector('.fa-bell')).not.toBeNull();
  });

  it('says how many are unread, or that you are all caught up', async () => {
    await boot(inboxPage([notification(1)], { unreadCount: 3 }));
    expect(byTestId('notification-summary')?.textContent).toContain('3 unread');
  });

  it('shows unread ones marked, and read ones with the word Read rather than only dimmed', async () => {
    await boot(inboxPage([notification(1), notification(2, { readAt: new Date().toISOString() })], { unreadCount: 1 }));

    expect(byTestId('notification-1')!.classList.contains('is-unread')).toBe(true);
    expect(byTestId('notification-1')!.querySelector('.ni-dot')).not.toBeNull();
    expect(byTestId('notification-1')!.getAttribute('aria-label')).toMatch(/^Unread: /);
    expect(byTestId('notification-2')!.classList.contains('is-unread')).toBe(false);
    expect(byTestId('notification-2')!.querySelector('.ni-read')?.textContent).toContain('Read');
    expect(byTestId('notification-2')!.getAttribute('aria-label')).toMatch(/^Read: /);
  });

  it('marks a notification read when it is clicked, and the summary follows', async () => {
    await boot(inboxPage([notification(1)], { unreadCount: 1 }));

    byTestId<HTMLButtonElement>('notification-1')!.click();
    (await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/1/read` }))).flush(
      notification(1, { readAt: new Date().toISOString() }),
    );
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('notification-1')!.classList.contains('is-unread')).toBe(false));
    expect(byTestId('notification-summary')?.textContent).toContain('all caught up');
  });

  it('searches after the customer stops typing, not on every key', async () => {
    await boot(inboxPage([notification(1)]));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const box = byTestId<HTMLInputElement>('notification-search')!;

    for (const text of ['A', 'AA', 'AAPL']) {
      box.value = text;
      box.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(100);
    }
    http.expectNone((r) => r.url === NOTIFICATIONS_URL);

    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    const request = await answerInbox(http, inboxPage([notification(7)]));

    expect(request.request.params.get('q')).toBe('AAPL');
  });

  it('filters by category through the dropdown', async () => {
    await boot(inboxPage([notification(1)]));

    const box = root.querySelector<HTMLInputElement>('[data-testid="notification-category"] input[data-value="WATCHLIST_ALERTS"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const request = await answerInbox(http, inboxPage([]));

    expect(request.request.params.getAll('category')).toEqual(['WATCHLIST_ALERTS']);
  });

  it('says no notifications match when a filter finds nothing, and that there are none when there are none', async () => {
    await boot(inboxPage([]));
    expect(byTestId('notification-empty')?.textContent).toContain('You have no unread notifications');

    const box = byTestId<HTMLInputElement>('notification-search')!;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    box.value = 'zzz';
    box.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await answerInbox(http, inboxPage([]));
    await fixture.whenStable();

    expect(byTestId('notification-empty')?.textContent).toContain('No notifications match');
  });

  it('pages through the inbox and offers the page sizes', async () => {
    await boot(inboxPage([notification(1)], { totalItems: 12, totalPages: 3 }));

    root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
    const request = await answerInbox(http, inboxPage([notification(6)], { page: 1, totalItems: 12, totalPages: 3 }));

    expect(request.request.params.get('page')).toBe('1');
    expect(root.querySelector('[data-testid="pagination-page-size"]')).not.toBeNull();
  });

  it('shows the reason with a retry when the inbox cannot be loaded', async () => {
    await answerLinkedAccount(http);
    (await vi.waitFor(() => http.expectOne((r) => r.url === NOTIFICATIONS_URL))).flush(null, { status: 500, statusText: 'x' });
    await fixture.whenStable();

    expect(byTestId('notification-error')).not.toBeNull();

    byTestId('notification-error')!.querySelector('button')!.click();
    await answerInbox(http, inboxPage([notification(1)]));
    await fixture.whenStable();
    expect(byTestId('notification-error')).toBeNull();
    expect(rows()).toHaveLength(1);
  });
});
