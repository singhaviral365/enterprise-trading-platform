import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import { RegisterForm } from './register-form';

describe('RegisterForm', () => {
  let fixture: ComponentFixture<RegisterForm>;
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
    await TestBed.configureTestingModule({
      imports: [RegisterForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(RegisterForm);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('blocks a password that is the same as the username (ignoring case)', async () => {
    await type('register-username', 'trader.one.long1');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Trader.One.Long1');
    await type('register-confirm-password', 'Trader.One.Long1');
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('register-submit')!.disabled).toBe(true);
    expect(root.textContent).toContain('Password must be different from your username.');
  });

  it('blocks a password without a capital letter, number or symbol', async () => {
    await type('register-username', 'trader.one7');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'tradingdeskpass');
    await type('register-confirm-password', 'tradingdeskpass');
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('register-submit')!.disabled).toBe(true);
    expect(root.textContent).toContain('Password needs one capital letter (A-Z).');
  });

  it.each(['9trader.a', 'trader.one', 'traderone7'])('blocks registration for the username %p', async (username) => {
    await type('register-username', username);
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Tr@dingDesk2026');
    await type('register-confirm-password', 'Tr@dingDesk2026');
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('register-submit')!.disabled).toBe(true);
    expect(byTestId('register-username')?.getAttribute('aria-invalid')).toBe('true');
  });

  it.each(['paste', 'copy', 'cut', 'drop'])('prevents %s in both password fields and explains why', async (type) => {
    for (const id of ['register-password', 'register-confirm-password']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      byTestId<HTMLInputElement>(id)!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    await fixture.whenStable();
    expect(byTestId('register-clipboard-notice')?.textContent).toContain('Copy and paste are turned off');
  });

  it('still allows pasting into the username field', () => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    byTestId<HTMLInputElement>('register-username')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  async function fillValid(): Promise<void> {
    await type('register-username', 'trader.one7');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Tr@dingDesk2026');
    await type('register-confirm-password', 'Tr@dingDesk2026');
  }

  it('keeps Create account disabled until every field is valid, then enables it', async () => {
    const submit = byTestId<HTMLButtonElement>('register-submit')!;
    expect(submit.disabled).toBe(true);

    await fillValid();

    expect(submit.disabled).toBe(false);
  });

  async function reachCodeStep(): Promise<void> {
    await fillValid();
    byTestId<HTMLButtonElement>('register-submit')!.click();
    const register = await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register'));
    expect(register.request.body).toEqual({ username: 'trader.one7', password: 'Tr@dingDesk2026', email: 'trader@example.com' });
    register.flush({ verificationRequired: true, challenge: { challengeId: 'reg-1', email: 't***@example.com', expiresIn: 300, resendAfter: 30 } });
    await vi.waitFor(() => expect(byTestId('register-code-form')).not.toBeNull());
  }

  async function typeCode(value: string): Promise<void> {
    await type('register-code', value);
  }

  it('asks for the emailed code after the details, and creates nothing yet', async () => {
    const registered = vi.fn();
    fixture.componentInstance.registered.subscribe(registered);

    await reachCodeStep();

    expect(byTestId('register-form')).toBeNull();
    expect(byTestId('register-code-info')?.textContent).toContain('t***@example.com');
    expect(registered).not.toHaveBeenCalled();
    http.expectNone('http://localhost:3000/auth/register/verify');
    http.expectNone('http://localhost:3000/auth/login');
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('reports who registered only after the right code, and still signs nobody in', async () => {
    const registered = vi.fn();
    fixture.componentInstance.registered.subscribe(registered);
    await reachCodeStep();

    await typeCode('123456');
    byTestId<HTMLButtonElement>('register-code-submit')!.click();
    const verify = await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register/verify'));
    expect(verify.request.body).toEqual({ challengeId: 'reg-1', code: '123456' });
    verify.flush({ id: 1, username: 'trader.one7', email: 'trader@example.com', roles: [], createdOn: '', twoFactorEnabled: false });

    await vi.waitFor(() => expect(registered).toHaveBeenCalledWith({ username: 'trader.one7', email: 'trader@example.com' }));
    http.expectNone('http://localhost:3000/auth/login');
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('reports a login that was created at once when the email check is switched off', async () => {
    const registered = vi.fn();
    fixture.componentInstance.registered.subscribe(registered);
    await fillValid();

    byTestId<HTMLButtonElement>('register-submit')!.click();
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register'))).flush({
      verificationRequired: false,
      user: { id: 1, username: 'trader.one7', email: 'trader@example.com', roles: [], createdOn: '', twoFactorEnabled: false },
    });

    await vi.waitFor(() => expect(registered).toHaveBeenCalledWith({ username: 'trader.one7', email: 'trader@example.com' }));
  });

  it('keeps the code step open and says so when the code is wrong', async () => {
    const registered = vi.fn();
    fixture.componentInstance.registered.subscribe(registered);
    await reachCodeStep();

    await typeCode('000000');
    byTestId<HTMLButtonElement>('register-code-submit')!.click();
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register/verify'))).flush(
      { errorCode: 'OTP-401', message: 'x' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await vi.waitFor(() => expect(byTestId('register-code-error')).not.toBeNull());
    expect(registered).not.toHaveBeenCalled();
    expect(byTestId('register-code-form')).not.toBeNull();
  });

  it('refuses a code that is not six digits without calling the server', async () => {
    await reachCodeStep();

    await typeCode('12ab');

    expect(byTestId<HTMLButtonElement>('register-code-submit')!.disabled).toBe(true);
    expect(byTestId('register-code-field-error')?.textContent).toContain('6 digits');
  });

  it('goes back to the details from the code step without calling the server', async () => {
    await reachCodeStep();

    byTestId<HTMLButtonElement>('register-code-back')!.click();
    await fixture.whenStable();

    expect(byTestId('register-form')).not.toBeNull();
    expect(byTestId('register-code-form')).toBeNull();
  });

  it('does not let the code be asked for again until the wait is over', async () => {
    await reachCodeStep();

    const resend = byTestId<HTMLButtonElement>('register-resend')!;
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toContain('30s');
  });

  it('explains a username that is already taken and does not try to sign in', async () => {
    await fillValid();

    byTestId<HTMLButtonElement>('register-submit')!.click();
    (await vi.waitFor(() => http.expectOne('http://localhost:3000/auth/register'))).flush(
      { errorCode: 'AUTH-409', message: 'Conflict' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(byTestId('register-error')?.textContent).toContain('already registered');
    http.expectNone('http://localhost:3000/auth/login');
  });

  it('blocks submission when the two passwords differ', async () => {
    await fillValid();
    await type('register-confirm-password', 'Tr@dingDesk2027');
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('register-submit')!.disabled).toBe(true);
    expect(root.textContent).toContain('Passwords do not match.');
  });
});
