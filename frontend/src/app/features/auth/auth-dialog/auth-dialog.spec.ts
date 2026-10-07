import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideApiClients } from '../../../api/api.config';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { AuthDialog } from './auth-dialog';

@Component({ template: 'dashboard' })
class DashboardStub {}

const LOGIN_URL = 'http://localhost:3000/auth/login';
const LINK_URL = '/api/v1/accounts/link';
const PREFERENCES_URL = '/api/v1/accounts/1001/preferences';
const PREFERENCES = {
  accountId: 1001,
  preferredCurrency: 'EUR',
  channels: ['IN_APP'],
  categories: ['ORDER_STATUS', 'WATCHLIST_ALERTS'],
  dateFormat: 'MON_DD_YYYY',
  timeFormat: 'H12',
  numberFormat: 'US',
  aiAssistantEnabled: false,
  theme: 'SYSTEM',
  landingPage: 'DASHBOARD',
  defaultOrderType: 'MARKET',
  updatedAt: null,
};
const TOKENS = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

describe('AuthDialog', () => {
  let fixture: ComponentFixture<AuthDialog>;
  let dialogs: AuthDialogService;
  let router: Router;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function signIn(returnUrl: string | null = null): Promise<void> {
    dialogs.open('login', returnUrl);
    await fixture.whenStable();
    for (const [id, value] of [
      ['login-username', 'alice.trader'],
      ['login-password', 'correct horse battery staple'],
    ]) {
      const input = byTestId<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('login-submit')!.click();
    // two-step sign-in off: step one signs in
    (await vi.waitFor(() => http.expectOne(LOGIN_URL))).flush({ twoFactorRequired: false, tokens: TOKENS });
  }

  /** Types the username and password and answers step one with a challenge: the code step shows. */
  async function reachCodeStep(returnUrl: string | null = null): Promise<void> {
    dialogs.open('login', returnUrl);
    await fixture.whenStable();
    for (const [id, value] of [
      ['login-username', 'alice.trader'],
      ['login-password', 'correct horse battery staple'],
    ]) {
      const input = byTestId<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('login-submit')!.click();
    (await vi.waitFor(() => http.expectOne(LOGIN_URL))).flush({
      twoFactorRequired: true,
      challenge: { challengeId: 'c-1', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 },
    });
    await vi.waitFor(() => expect(byTestId('login-code-form')).toBeTruthy());
  }

  async function enterCode(code: string): Promise<void> {
    const input = byTestId<HTMLInputElement>('login-code')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('login-code-submit')!.click();
  }

  /**
   * Answers every pending link lookup. Signing in starts two: the dialog's own, and the shared account store's (the
   * preferences it feeds are keyed by the linked account).
   */
  async function answerLink(body: object | null, init?: { status: number; statusText: string }): Promise<void> {
    const requests = await vi.waitFor(() => {
      const found = http.match(LINK_URL);
      if (found.length === 0) {
        throw new Error('no link lookup yet');
      }
      return found;
    });
    requests.forEach((request) => (init ? request.flush(body, init) : request.flush(body)));
  }

  beforeAll(() => {
    // jsdom does not implement the modal methods of <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AuthDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([{ path: 'dashboard', component: DashboardStub }]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AuthDialog);
    dialogs = TestBed.inject(AuthDialogService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  it('signs in a user with a linked account, closes and redirects to the dashboard', async () => {
    await signIn();
    await answerLink({ linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' });
    // the landing page is read from the customer's preferences before the dialog closes
    (await vi.waitFor(() => http.expectOne(PREFERENCES_URL))).flush(PREFERENCES);

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
    expect(dialogs.isOpen()).toBe(false);
  });

  it('opens the page the customer chose to land on', async () => {
    TestBed.inject(Router).resetConfig([
      { path: 'dashboard', component: DashboardStub },
      { path: 'market', component: DashboardStub },
    ]);
    await signIn();
    await answerLink({ linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' });
    (await vi.waitFor(() => http.expectOne(PREFERENCES_URL))).flush({ ...PREFERENCES, landingPage: 'MARKET' });

    await vi.waitFor(() => expect(router.url).toBe('/market'));
  });

  it('opens the dashboard when the preferences cannot be read, rather than holding sign-in up', async () => {
    await signIn();
    await answerLink({ linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' });
    (await vi.waitFor(() => http.expectOne(PREFERENCES_URL))).flush(null, { status: 503, statusText: 'x' });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });

  it('prefers the page the guard interrupted over the landing page, and does not even ask for it', async () => {
    TestBed.inject(Router).resetConfig([
      { path: 'dashboard', component: DashboardStub },
      { path: 'orders', component: DashboardStub },
    ]);
    await signIn('/orders');
    await answerLink({ linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' });

    await vi.waitFor(() => expect(router.url).toBe('/orders'));
    http.expectNone(PREFERENCES_URL);
  });

  describe('two-step sign-in', () => {
    it('keeps the dialog open on the code step: the password alone opens nothing', async () => {
      await reachCodeStep();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(dialogs.isOpen()).toBe(true);
      expect(router.url).toBe('/');
      http.expectNone(LINK_URL);
    });

    it('signs in with the emailed code, then closes and lands on the dashboard', async () => {
      await reachCodeStep();

      await enterCode('482913');
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/login/verify'))).flush(TOKENS);
      await answerLink({ linked: true, message: 'Linked account found' });

      await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
      expect(dialogs.isOpen()).toBe(false);
    });

    it('sends the user to the page the guard interrupted once the code is right', async () => {
      TestBed.inject(Router).resetConfig([
        { path: 'dashboard', component: DashboardStub },
        { path: 'orders', component: DashboardStub },
      ]);
      await reachCodeStep('/orders');

      await enterCode('482913');
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/login/verify'))).flush(TOKENS);
      await answerLink({ linked: true, message: 'Linked account found' });

      await vi.waitFor(() => expect(router.url).toBe('/orders'));
    });

    it('stays on the code step with the reason when the code is wrong', async () => {
      await reachCodeStep();

      await enterCode('000000');
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/login/verify'))).flush(
        { errorCode: 'OTP-401', message: 'x' },
        { status: 401, statusText: 'Unauthorized' },
      );

      await vi.waitFor(() => expect(byTestId('login-code-error')?.textContent).toContain('not right'));
      expect(dialogs.isOpen()).toBe(true);
      expect(router.url).toBe('/');
    });
  });

  describe('forgot password', () => {
    it('opens from the sign-in form, carrying the username, and has no tabs', async () => {
      dialogs.open('login');
      await fixture.whenStable();
      const input = byTestId<HTMLInputElement>('login-username')!;
      input.value = 'alice.trader';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      byTestId<HTMLButtonElement>('login-forgot')!.click();
      await fixture.whenStable();

      expect(dialogs.mode()).toBe('forgot');
      expect(byTestId('forgot-request-form')).toBeTruthy();
      expect(byTestId<HTMLInputElement>('forgot-username')!.value).toBe('alice.trader');
      expect(root.querySelector('#auth-dialog-title')?.textContent).toContain('Reset your password');
      expect(byTestId('auth-tab-login')).toBeNull();
    });

    it('goes back to sign in from the first step', async () => {
      dialogs.open('login');
      await fixture.whenStable();
      byTestId<HTMLButtonElement>('login-forgot')!.click();
      await fixture.whenStable();

      byTestId<HTMLButtonElement>('forgot-back')!.click();
      await fixture.whenStable();

      expect(dialogs.mode()).toBe('login');
      expect(byTestId('login-form')).toBeTruthy();
    });

    it('after the password is changed returns to sign-in with the username, a notice, and nobody signed in', async () => {
      dialogs.open('login');
      await fixture.whenStable();
      byTestId<HTMLButtonElement>('login-forgot')!.click();
      await fixture.whenStable();
      const type = async (id: string, value: string) => {
        const field = byTestId<HTMLInputElement>(id)!;
        field.value = value;
        field.dispatchEvent(new Event('input'));
        field.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
      };
      await type('forgot-username', 'alice.trader');
      await type('forgot-email', 'alice@example.com');
      byTestId<HTMLButtonElement>('forgot-request-submit')!.click();
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/password/forgot'))).flush(
        { challengeId: 'c-9', expiresIn: 600, resendAfter: 30 },
        { status: 202, statusText: 'Accepted' },
      );
      await vi.waitFor(() => expect(byTestId('forgot-code-form')).toBeTruthy());
      await type('forgot-code', '482913');
      byTestId<HTMLButtonElement>('forgot-code-submit')!.click();
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/password/verify'))).flush({
        resetToken: 'reset-token',
        expiresIn: 600,
      });
      await vi.waitFor(() => expect(byTestId('forgot-password-form')).toBeTruthy());
      await type('forgot-new-password', 'N3w!Password#1');
      await type('forgot-confirm-password', 'N3w!Password#1');

      byTestId<HTMLButtonElement>('forgot-password-submit')!.click();
      (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/password/reset'))).flush(null, {
        status: 204,
        statusText: 'No Content',
      });

      await vi.waitFor(() => expect(dialogs.mode()).toBe('login'));
      await fixture.whenStable();
      expect(byTestId('login-notice')?.textContent).toContain('Your password was changed');
      expect(byTestId<HTMLInputElement>('login-username')!.value).toBe('alice.trader');
      expect(byTestId('login-code-form')).toBeNull();
      expect(dialogs.isOpen()).toBe(true);
    });
  });

  it('sends the user to the page the guard interrupted, not the dashboard', async () => {
    TestBed.inject(Router).resetConfig([
      { path: 'dashboard', component: DashboardStub },
      { path: 'orders', component: DashboardStub },
    ]);
    await signIn('/orders');
    await answerLink({ linked: true, message: 'Linked account found' });

    await vi.waitFor(() => expect(router.url).toBe('/orders'));
  });

  it('ignores a return address that leaves this site', async () => {
    await signIn('//evil.example/phish');
    await answerLink({ linked: true, message: 'Linked account found' });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });

  it('asks a user without a linked account for the account details', async () => {
    await signIn();
    await answerLink({ linked: false, message: 'No linked account yet' });

    // With no email from registration, the form asks the Auth service for the profile. The fixture is not
    // stable while that request is open, so answer it before waiting on the render.
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/me'))).flush({
      id: 1,
      username: 'alice.trader',
      email: 'alice@example.com',
      roles: [],
      createdOn: '',
    });
    await fixture.whenStable();

    expect(byTestId('account-setup-form')).toBeTruthy();
    expect(dialogs.mode()).toBe('account');
    expect(dialogs.isOpen()).toBe(true);
    expect(router.url).toBe('/');
    await vi.waitFor(() => expect(byTestId<HTMLInputElement>('account-email')!.value).toBe('alice@example.com'));
  });

  it('after registering returns to sign-in with the username and a note, and signs nobody in', async () => {
    dialogs.open('register');
    await fixture.whenStable();
    const type = async (id: string, value: string) => {
      const field = byTestId<HTMLInputElement>(id)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      field.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    };
    await type('register-username', 'trader.one7');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Tr@dingDesk2026');
    await type('register-confirm-password', 'Tr@dingDesk2026');

    byTestId<HTMLButtonElement>('register-submit')!.click();
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register'))).flush({
      verificationRequired: true,
      challenge: { challengeId: 'reg-1', email: 't***@example.com', expiresIn: 300, resendAfter: 30 },
    });
    // the code step: nothing is created until the emailed code is typed
    await vi.waitFor(() => expect(byTestId('register-code-form')).not.toBeNull());
    expect(dialogs.mode()).toBe('register');
    await type('register-code', '123456');
    byTestId<HTMLButtonElement>('register-code-submit')!.click();
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register/verify'))).flush({ id: 1, username: 'trader.one7', email: 'trader@example.com', roles: [], createdOn: '', twoFactorEnabled: false });

    await vi.waitFor(() => expect(dialogs.mode()).toBe('login'));
    await fixture.whenStable();
    expect(byTestId('login-notice')?.textContent).toContain('Your login was created');
    expect(byTestId<HTMLInputElement>('login-username')!.value).toBe('trader.one7');
    expect(dialogs.prefillEmail()).toBe('trader@example.com');
    http.expectNone(LOGIN_URL);
  });

  it('switches between the sign-in and register forms', async () => {
    dialogs.open('login');
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('auth-tab-register')!.click();
    await fixture.whenStable();

    expect(byTestId('register-form')).toBeTruthy();
    expect(byTestId('login-form')).toBeNull();
    expect(byTestId('auth-tab-register')?.getAttribute('aria-selected')).toBe('true');
  });
  it('moves between the tabs with the arrow, Home and End keys', async () => {
    dialogs.open('login');
    await fixture.whenStable();
    const tabs = byTestId('auth-tab-login')!.parentElement!;

    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(dialogs.mode()).toBe('register');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(dialogs.mode()).toBe('login');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(dialogs.mode()).toBe('register');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(dialogs.mode()).toBe('login');

    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(dialogs.mode()).toBe('login');
  });

  it.each([
    ['the close button', () => byTestId<HTMLButtonElement>('auth-dialog-close')!.click()],
    ['Esc', () => byTestId('auth-dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))],
    ['a click on the backdrop', () => byTestId('auth-dialog')!.click()],
  ])('closes without signing in from %s', async (_name, act) => {
    dialogs.open('login');
    await fixture.whenStable();

    act();
    await fixture.whenStable();

    expect(dialogs.isOpen()).toBe(false);
    expect(router.url).toBe('/');
  });

  it('does not close when the panel itself is clicked', async () => {
    dialogs.open('login');
    await fixture.whenStable();

    root.querySelector<HTMLElement>('.auth-panel')!.click();

    expect(dialogs.isOpen()).toBe(true);
  });

  it('still lands a signed-in user without an account on the dashboard when they skip the account step', async () => {
    await signIn();
    await answerLink({ linked: false, message: 'No linked account yet' });
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/me'))).flush({
      id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], createdOn: '',
    });
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('auth-dialog-close')!.click();

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
    expect(dialogs.isOpen()).toBe(false);
  });

  it('carries on to the dashboard when the account lookup fails', async () => {
    await signIn();
    await answerLink(null, { status: 500, statusText: 'x' });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });
});
