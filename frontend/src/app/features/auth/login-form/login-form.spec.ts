import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { SESSION_STORAGE_KEY, SessionService } from '../../../core/session.service';
import { LoginForm } from './login-form';

const LOGIN_URL = 'http://localhost:3000/auth/login';

describe('LoginForm', () => {
  let fixture: ComponentFixture<LoginForm>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginForm);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('exposes stable test identifiers for the username, password and submit controls', () => {
    expect(byTestId('login-username')).toBeInstanceOf(HTMLInputElement);
    expect(byTestId('login-password')).toBeInstanceOf(HTMLInputElement);
    expect(byTestId('login-submit')).toBeInstanceOf(HTMLButtonElement);
  });

  it('signs in with valid credentials, remembers the session (not the tokens) and emits signedIn', async () => {
    const signedIn = vi.fn();
    fixture.componentInstance.signedIn.subscribe(signedIn);

    await type('login-username', 'alice.trader');
    await type('login-password', 'correct horse battery staple');
    byTestId<HTMLButtonElement>('login-submit')!.click();

    const request = await vi.waitFor(() => http.expectOne(LOGIN_URL));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      username: 'alice.trader',
      password: 'correct horse battery staple',
    });
    request.flush({ accessToken: 'access-1', refreshToken: 'refresh-1', tokenType: 'Bearer', expiresIn: 900 });

    await vi.waitFor(() => expect(signedIn).toHaveBeenCalledWith({ username: 'alice.trader' }));
    const session = TestBed.inject(SessionService);
    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain('alice.trader');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('access-1');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('refresh-1');
  });

  it('shows a readable error when the credentials are rejected', async () => {
    const signedIn = vi.fn();
    fixture.componentInstance.signedIn.subscribe(signedIn);

    await type('login-username', 'alice.trader');
    await type('login-password', 'wrong password');
    byTestId<HTMLButtonElement>('login-submit')!.click();

    const request = await vi.waitFor(() => http.expectOne(LOGIN_URL));
    request.flush(
      { errorCode: 'AUTH-401', message: 'Unauthorised' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(byTestId('login-error')?.textContent).toContain('Incorrect username or password.');
    });
    expect(byTestId('login-error')?.getAttribute('role')).toBe('alert');
    expect(signedIn).not.toHaveBeenCalled();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('keeps Sign in disabled while empty, shows messages once the fields are visited, and enables when filled', async () => {
    const submit = byTestId<HTMLButtonElement>('login-submit')!;
    expect(submit.disabled).toBe(true);

    byTestId('login-username')!.dispatchEvent(new Event('blur'));
    byTestId('login-password')!.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(submit.disabled).toBe(true);
    http.expectNone(LOGIN_URL);
    expect(byTestId('login-username-error')?.textContent).toContain('Enter your username.');
    expect(byTestId('login-password-error')?.textContent).toContain('Enter your password.');
    expect(byTestId('login-username')?.getAttribute('aria-invalid')).toBe('true');

    await type('login-username', 'alice.trader');
    await type('login-password', 'secret');
    expect(submit.disabled).toBe(false);
  });
});

describe('LoginForm password field', () => {
  it('prevents pasting into the password field', async () => {
    await TestBed.configureTestingModule({
      imports: [LoginForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginForm);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const event = new Event('paste', { bubbles: true, cancelable: true });
    root.querySelector<HTMLInputElement>('[data-testid="login-password"]')!.dispatchEvent(event);
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
    expect(root.querySelector('[data-testid="login-clipboard-notice"]')?.textContent).toContain(
      'Copy and paste are turned off',
    );
  });
});
