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

  async function signIn(): Promise<void> {
    dialogs.open('login');
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

  it('asks a user without a linked account for the account details', async () => {
    await signIn();
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(byTestId('account-setup-form')).toBeTruthy();
    });
    expect(dialogs.mode()).toBe('account');
    expect(dialogs.isOpen()).toBe(true);
    expect(router.url).toBe('/');
    // With no email from registration, the form asks the Auth service for the profile.
    http.expectOne('http://localhost:3000/auth/me').flush({ id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], createdOn: '' });
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
});
