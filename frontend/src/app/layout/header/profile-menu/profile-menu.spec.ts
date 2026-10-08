import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AUTH_API_BASE_URL, provideApiClients } from '../../../api/api.config';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { SessionService } from '../../../core/session.service';
import { TEST_TOKENS, answerLinkedAccount, answerUnlinkedAccount } from '../../../testing/trade-http';
import { ProfileMenu } from './profile-menu';

const ME = { id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], twoFactorEnabled: true, createdOn: '2026-10-05T08:00:00Z' };
const ME_URL = `${AUTH_API_BASE_URL}/auth/me`;

describe('ProfileMenu', () => {
  let fixture: ComponentFixture<ProfileMenu>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const trigger = () => byTestId<HTMLButtonElement>('open-profile')!;
  const pane = () => byTestId('profile-menu-pane');

  async function openPane(): Promise<void> {
    trigger().click();
    await answerProfile();
    await fixture.whenStable();
  }

  /** The profile resource lives in a root service, so its effect runs on a tick; ticks until the request appears. */
  async function answerProfile(): Promise<void> {
    (
      await vi.waitFor(() => {
        fixture.detectChanges();
        return http.expectOne({ method: 'GET', url: ME_URL });
      })
    ).flush(ME);
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProfileMenu],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(ProfileMenu);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('is one icon button named after the user, with the pane closed and nothing loaded from the auth service', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();

    expect(trigger().getAttribute('aria-label')).toBe('Account menu for alice.trader');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent?.trim()).toBe('');
    expect(pane()).toBeNull();
    http.expectNone(ME_URL);
  });

  it('shows who is signed in and the linked account together, once opened', async () => {
    await answerLinkedAccount(http, { cashBalance: 24800 });
    await fixture.whenStable();

    await openPane();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(byTestId('profile-username')?.textContent).toContain('alice.trader');
    expect(byTestId('profile-email')?.textContent).toContain('alice@example.com');
    expect(byTestId('profile-two-factor')?.textContent).toContain('On');
    expect(byTestId('profile-created')).not.toBeNull();
    expect(byTestId('account-menu-number')?.textContent).toContain('ACC000001001');
    expect(byTestId('profile-balance')?.textContent).toContain('$24,800.00');
    expect(pane()!.querySelector('.status-badge.is-active')).toBeTruthy();
  });

  it('reads the profile again every time it is opened', async () => {
    await answerUnlinkedAccount(http);
    await openPane();

    trigger().click();
    await fixture.whenStable();
    expect(pane()).toBeNull();

    trigger().click();
    await answerProfile();
  });

  it('degrades each half on its own: a failed profile still shows the account', async () => {
    await answerLinkedAccount(http);
    await fixture.whenStable();

    trigger().click();
    (await vi.waitFor(() => {
      fixture.detectChanges();
      return http.expectOne(ME_URL);
    })).flush(null, { status: 500, statusText: 'x' });
    await fixture.whenStable();

    expect(byTestId('profile-error')).not.toBeNull();
    expect(byTestId('account-menu-number')).not.toBeNull();
  });

  it('degrades each half on its own: a failed account still shows the profile', async () => {
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush(null, { status: 500, statusText: 'x' });
    await fixture.whenStable();

    await openPane();

    expect(byTestId('profile-account-error')).not.toBeNull();
    expect(byTestId('profile-email')?.textContent).toContain('alice@example.com');
  });

  it('offers to open an account when none is linked, and closes itself', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    await openPane();

    expect(pane()!.textContent).toContain('No trading account is linked yet.');
    [...pane()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Open my account'))!.click();
    await fixture.whenStable();

    const dialogs = TestBed.inject(AuthDialogService);
    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('account');
    expect(pane()).toBeNull();
  });

  it('moves focus into the pane, and Esc closes it and puts focus back on the button', async () => {
    await answerUnlinkedAccount(http);
    document.body.appendChild(root);
    await fixture.whenStable();
    await openPane();

    await vi.waitFor(() => expect(document.activeElement).toBe(pane()));

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(pane()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    root.remove();
  });

  it('closes on a click elsewhere but not on a click inside', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    await openPane();

    pane()!.click();
    await fixture.whenStable();
    expect(pane()).not.toBeNull();

    document.body.click();
    await fixture.whenStable();
    expect(pane()).toBeNull();
  });

  it('closes when focus moves outside', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    await openPane();

    root.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }));
    await fixture.whenStable();

    expect(pane()).toBeNull();
  });

  it('swaps to the change-password form inside the pane, and Back returns to the details', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    await openPane();

    byTestId<HTMLButtonElement>('profile-change-password')!.click();
    await fixture.whenStable();
    expect(byTestId('change-password-form')).not.toBeNull();
    expect(byTestId('profile-details')).toBeNull();

    byTestId<HTMLButtonElement>('change-password-cancel')!.click();
    await fixture.whenStable();
    expect(byTestId('change-password-form')).toBeNull();
    expect(byTestId('profile-details')).not.toBeNull();
  });
});
