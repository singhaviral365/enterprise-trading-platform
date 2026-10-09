import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../../api/api.config';
import { SessionService } from '../../core/session.service';
import { answerInbox, inboxPage, notification } from '../../testing/notifications-http';
import { TEST_TOKENS, answerLinkedAccount } from '../../testing/trade-http';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  let fixture: ComponentFixture<NotificationBell>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function boot(body: object): Promise<void> {
    await answerLinkedAccount(http);
    await answerInbox(http, body);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(NotificationBell);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('shows the unread count on the bell and says it to a screen reader', async () => {
    await boot(inboxPage([notification(1)], { unreadCount: 5 }));

    expect(byTestId('notification-badge')?.textContent?.trim()).toBe('5');
    expect(byTestId('notification-bell')?.getAttribute('aria-label')).toBe('Notifications, 5 unread');
    expect(byTestId('notification-badge')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows no badge when everything is read', async () => {
    await boot(inboxPage([], { unreadCount: 0 }));

    expect(byTestId('notification-badge')).toBeNull();
    expect(byTestId('notification-bell')?.getAttribute('aria-label')).toBe('Notifications');
  });

  it('caps a very large count at 99+', async () => {
    await boot(inboxPage([notification(1)], { unreadCount: 250 }));

    expect(byTestId('notification-badge')?.textContent?.trim()).toBe('99+');
  });

  it('shows the label only when the sidebar is expanded', async () => {
    await boot(inboxPage([], { unreadCount: 0 }));
    expect(root.querySelector('.bell-text')).toBeNull();

    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();

    expect(root.querySelector('.bell-text')?.textContent).toContain('Notifications');
  });

  it('is a link to the notifications page, not a pop-up', async () => {
    await boot(inboxPage([notification(1)], { unreadCount: 1 }));

    const bell = byTestId<HTMLAnchorElement>('notification-bell')!;

    expect(bell.tagName).toBe('A');
    expect(bell.getAttribute('href')).toBe('/notifications');
    expect(bell.hasAttribute('aria-haspopup')).toBe(false);
  });
});
