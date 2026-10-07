import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { SESSION_STORAGE_KEY, SessionService } from '../../../core/session.service';
import { LoginForm } from './login-form';

const LOGIN_URL = 'http://localhost:3000/auth/login';
const VERIFY_URL = 'http://localhost:3000/auth/login/verify';
const RESEND_URL = 'http://localhost:3000/auth/login/resend';
const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1', tokenType: 'Bearer', expiresIn: 900 };
const CHALLENGE = { challengeId: 'c-1', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 };

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

  it('signs in at once when two-step sign-in is off, remembers the session (not the tokens) and emits signedIn', async () => {
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
    request.flush({ twoFactorRequired: false, tokens: TOKENS });

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

describe('LoginForm two-step sign-in', () => {
  let fixture: ComponentFixture<LoginForm>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  /** Enters the username and password and answers step one with a code challenge. */
  async function reachCodeStep(challenge = CHALLENGE): Promise<void> {
    await type('login-username', 'alice.trader');
    await type('login-password', 'correct horse battery staple');
    byTestId<HTMLButtonElement>('login-submit')!.click();
    (await vi.waitFor(() => http.expectOne(LOGIN_URL))).flush({ twoFactorRequired: true, challenge });
    await vi.waitFor(() => expect(byTestId('login-code-form')).toBeTruthy());
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

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('asks for the emailed code after the password, and signs nobody in yet', async () => {
    const signedIn = vi.fn();
    fixture.componentInstance.signedIn.subscribe(signedIn);

    await reachCodeStep();

    expect(byTestId('login-form')).toBeNull();
    expect(byTestId('login-code-info')?.textContent).toContain('a***@example.com');
    expect(byTestId('login-code')?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(byTestId('login-code')?.getAttribute('inputmode')).toBe('numeric');
    expect(signedIn).not.toHaveBeenCalled();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('signs in with the right code, under the username that was entered', async () => {
    const signedIn = vi.fn();
    fixture.componentInstance.signedIn.subscribe(signedIn);
    await reachCodeStep();

    await type('login-code', '482913');
    byTestId<HTMLButtonElement>('login-code-submit')!.click();
    const request = await vi.waitFor(() => http.expectOne(VERIFY_URL));
    expect(request.request.body).toEqual({ challengeId: 'c-1', code: '482913' });
    request.flush(TOKENS);

    await vi.waitFor(() => expect(signedIn).toHaveBeenCalledWith({ username: 'alice.trader' }));
    const session = TestBed.inject(SessionService);
    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('access-1');
  });

  it('says the code was not right, clears it, and stays on the code step', async () => {
    const signedIn = vi.fn();
    fixture.componentInstance.signedIn.subscribe(signedIn);
    await reachCodeStep();

    await type('login-code', '000000');
    byTestId<HTMLButtonElement>('login-code-submit')!.click();
    (await vi.waitFor(() => http.expectOne(VERIFY_URL))).flush(
      { errorCode: 'OTP-401', message: 'Invalid or expired code' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(byTestId('login-code-error')?.textContent).toContain('not right, or it has expired');
    });
    expect(byTestId('login-code-error')?.getAttribute('role')).toBe('alert');
    expect(byTestId<HTMLInputElement>('login-code')!.value).toBe('');
    expect(signedIn).not.toHaveBeenCalled();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('says to wait when there have been too many attempts', async () => {
    await reachCodeStep();
    await type('login-code', '000000');

    byTestId<HTMLButtonElement>('login-code-submit')!.click();
    (await vi.waitFor(() => http.expectOne(VERIFY_URL))).flush(
      { errorCode: 'OTP-429', message: 'x' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(byTestId('login-code-error')?.textContent).toContain('Too many attempts');
    });
  });

  it.each(['12345', 'abcdef', '1234567'])('does not send a code that is not six digits ("%s")', async (code) => {
    await reachCodeStep();

    await type('login-code', code);

    http.expectNone(VERIFY_URL);
    expect(byTestId<HTMLButtonElement>('login-code-submit')!.disabled).toBe(true);
    expect(byTestId('login-code-field-error')?.textContent).toContain('6 digits');
  });

  it('holds "send a new code" back until the wait is over, then asks for one', async () => {
    await reachCodeStep({ ...CHALLENGE, resendAfter: 1 });
    const resend = byTestId<HTMLButtonElement>('login-resend')!;
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toContain('Send again in');

    await vi.waitFor(() => expect(resend.disabled).toBe(false), { timeout: 3000 });
    expect(resend.textContent).toContain('Send a new code');
    resend.click();
    const request = await vi.waitFor(() => http.expectOne(RESEND_URL));
    expect(request.request.body).toEqual({ challengeId: 'c-1' });
    request.flush({ ...CHALLENGE, resendAfter: 30 });

    await vi.waitFor(() => expect(byTestId('login-code-notice')?.textContent).toContain('new code'));
    expect(byTestId<HTMLButtonElement>('login-resend')!.disabled).toBe(true);
  });

  it('shows why a new code could not be sent', async () => {
    await reachCodeStep({ ...CHALLENGE, resendAfter: 1 });
    await vi.waitFor(() => expect(byTestId<HTMLButtonElement>('login-resend')!.disabled).toBe(false), {
      timeout: 3000,
    });

    byTestId<HTMLButtonElement>('login-resend')!.click();
    (await vi.waitFor(() => http.expectOne(RESEND_URL))).flush(
      { errorCode: 'OTP-503', message: 'x' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    await vi.waitFor(() => expect(byTestId('login-code-error')?.textContent).toContain('could not send the code'));
  });

  it('goes back to the password step, with the password cleared, to use another account', async () => {
    await reachCodeStep();

    byTestId<HTMLButtonElement>('login-code-back')!.click();
    await fixture.whenStable();

    expect(byTestId('login-form')).toBeTruthy();
    expect(byTestId<HTMLInputElement>('login-username')!.value).toBe('alice.trader');
    expect(byTestId<HTMLInputElement>('login-password')!.value).toBe('');
    expect(byTestId('login-code-form')).toBeNull();
  });

  it('shows the error and stays on the password step when the password is wrong, with no code step', async () => {
    await type('login-username', 'alice.trader');
    await type('login-password', 'wrong');
    byTestId<HTMLButtonElement>('login-submit')!.click();
    (await vi.waitFor(() => http.expectOne(LOGIN_URL))).flush(
      { errorCode: 'AUTH-401', message: 'Unauthorised' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await vi.waitFor(() => expect(byTestId('login-error')?.textContent).toContain('Incorrect username or password.'));
    expect(byTestId('login-code-form')).toBeNull();
  });

  it('offers "Forgot password?" under the password, handing over the username typed so far', async () => {
    const forgot = vi.fn();
    fixture.componentInstance.forgotPassword.subscribe(forgot);
    await type('login-username', ' alice.trader ');

    byTestId<HTMLButtonElement>('login-forgot')!.click();

    expect(forgot).toHaveBeenCalledWith('alice.trader');
  });

  it('starts with a given username filled in, and a notice above the form', async () => {
    fixture.componentRef.setInput('initialUsername', 'trader.one7');
    fixture.componentRef.setInput('notice', 'Your password was changed.');
    await fixture.whenStable();

    expect(byTestId<HTMLInputElement>('login-username')!.value).toBe('trader.one7');
    expect(byTestId('login-notice')?.textContent).toContain('Your password was changed.');
    expect(byTestId('login-notice')?.getAttribute('role')).toBe('status');
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
