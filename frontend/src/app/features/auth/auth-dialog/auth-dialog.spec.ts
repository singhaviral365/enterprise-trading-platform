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
    (await vi.waitFor(() => http.expectOne(LOGIN_URL))).flush(TOKENS);
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
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({
      linked: true,
      message: 'Linked account found',
      accountNumber: 'ACC000001001',
    });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
    expect(dialogs.isOpen()).toBe(false);
  });

  it('sends the user to the page the guard interrupted, not the dashboard', async () => {
    TestBed.inject(Router).resetConfig([
      { path: 'dashboard', component: DashboardStub },
      { path: 'orders', component: DashboardStub },
    ]);
    await signIn('/orders');
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: true, message: 'Linked account found' });

    await vi.waitFor(() => expect(router.url).toBe('/orders'));
  });

  it('ignores a return address that leaves this site', async () => {
    await signIn('//evil.example/phish');
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: true, message: 'Linked account found' });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });

  it('asks a user without a linked account for the account details', async () => {
    await signIn();
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });

    // The form pulls in the shared account store (a second link lookup) and, with no email from
    // registration, asks the Auth service for the profile. The fixture is not stable while either request
    // is open, so answer both before waiting on the render.
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });
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
    expect(byTestId<HTMLInputElement>('account-email')!.value).toBe('alice@example.com');
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
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });
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
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush(null, { status: 500, statusText: 'x' });

    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });
});
