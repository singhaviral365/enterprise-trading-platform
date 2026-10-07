import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import { ForgotPasswordForm } from './forgot-password-form';

const BASE = 'http://localhost:3000/auth/password';
const ACCEPTED = { status: 202, statusText: 'Accepted' };
const ANSWER = { challengeId: 'c-9', expiresIn: 600, resendAfter: 30 };
const GOOD_PASSWORD = 'N3w!Password#1';

describe('ForgotPasswordForm', () => {
  let fixture: ComponentFixture<ForgotPasswordForm>;
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

  async function click(testId: string): Promise<void> {
    byTestId<HTMLButtonElement>(testId)!.click();
    await fixture.whenStable();
  }

  /** Step one answered: the code step is showing. */
  async function reachCodeStep(): Promise<void> {
    await type('forgot-username', 'alice.trader');
    await type('forgot-email', 'alice@example.com');
    await click('forgot-request-submit');
    (await vi.waitFor(() => http.expectOne(`${BASE}/forgot`))).flush(ANSWER, ACCEPTED);
    await vi.waitFor(() => expect(byTestId('forgot-code-form')).toBeTruthy());
  }

  /** Step two answered: the new-password step is showing. */
  async function reachPasswordStep(): Promise<void> {
    await reachCodeStep();
    await type('forgot-code', '482913');
    await click('forgot-code-submit');
    (await vi.waitFor(() => http.expectOne(`${BASE}/verify`))).flush({ resetToken: 'reset-token', expiresIn: 600 });
    await vi.waitFor(() => expect(byTestId('forgot-password-form')).toBeTruthy());
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(ForgotPasswordForm);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  describe('step 1: username and email', () => {
    it('asks for both, and sends nothing until they are filled in properly', async () => {
      const submit = byTestId<HTMLButtonElement>('forgot-request-submit')!;
      expect(submit.disabled).toBe(true);

      byTestId('forgot-username')!.dispatchEvent(new Event('blur'));
      byTestId('forgot-email')!.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      expect(byTestId('forgot-username-error')?.textContent).toContain('Enter your username.');
      expect(byTestId('forgot-email-error')?.textContent).toContain('Enter the email address');

      await type('forgot-username', 'alice.trader');
      await type('forgot-email', 'not-an-email');
      expect(byTestId('forgot-email-error')?.textContent).toContain('valid email');
      expect(submit.disabled).toBe(true);
      http.expectNone(`${BASE}/forgot`);

      await type('forgot-email', 'alice@example.com');
      expect(submit.disabled).toBe(false);
    });

    it('starts with the username from the sign-in form', async () => {
      fixture.componentRef.setInput('initialUsername', 'trader.one7');
      await fixture.whenStable();

      expect(byTestId<HTMLInputElement>('forgot-username')!.value).toBe('trader.one7');
    });

    it('sends the trimmed username and email, and moves to the code step whatever the details matched', async () => {
      await type('forgot-username', ' alice.trader ');
      await type('forgot-email', ' alice@example.com ');

      await click('forgot-request-submit');
      const request = await vi.waitFor(() => http.expectOne(`${BASE}/forgot`));
      expect(request.request.body).toEqual({ username: 'alice.trader', email: 'alice@example.com' });
      request.flush(ANSWER, ACCEPTED);

      await vi.waitFor(() => expect(byTestId('forgot-code-form')).toBeTruthy());
      // The wording does not say the details were found: it cannot know, and must not hint.
      expect(byTestId('forgot-code-info')?.textContent).toContain('If those details match an account');
    });

    it('shows why a request failed (too many asks) and stays on the step', async () => {
      await type('forgot-username', 'alice.trader');
      await type('forgot-email', 'alice@example.com');

      await click('forgot-request-submit');
      (await vi.waitFor(() => http.expectOne(`${BASE}/forgot`))).flush(
        { errorCode: 'OTP-429', message: 'x' },
        { status: 429, statusText: 'Too Many Requests' },
      );

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(byTestId('forgot-error')?.textContent).toContain('Too many attempts');
      });
      expect(byTestId('forgot-request-form')).toBeTruthy();
    });

    it('can hand back to the sign-in form', async () => {
      const back = vi.fn();
      fixture.componentInstance.backToLogin.subscribe(back);

      await click('forgot-back');

      expect(back).toHaveBeenCalled();
    });
  });

  describe('step 2: the emailed code', () => {
    it('sends the code with its challenge and moves on with a right one', async () => {
      await reachPasswordStep();

      expect(byTestId('forgot-code-form')).toBeNull();
    });

    it('sends exactly what was typed, trimmed', async () => {
      await reachCodeStep();
      await type('forgot-code', ' 482913 ');

      await click('forgot-code-submit');

      const request = await vi.waitFor(() => http.expectOne(`${BASE}/verify`));
      expect(request.request.body).toEqual({ challengeId: 'c-9', code: '482913' });
      request.flush({ resetToken: 'reset-token', expiresIn: 600 });
      await vi.waitFor(() => expect(byTestId('forgot-password-form')).toBeTruthy());
    });

    it.each(['12345', 'abcdef', '1234567'])('does not send a code that is not six digits ("%s")', async (code) => {
      await reachCodeStep();

      await type('forgot-code', code);

      http.expectNone(`${BASE}/verify`);
      expect(byTestId<HTMLButtonElement>('forgot-code-submit')!.disabled).toBe(true);
      expect(byTestId('forgot-code-field-error')?.textContent).toContain('6 digits');
    });

    it('says the code was not right, clears it, and stays on the step', async () => {
      await reachCodeStep();
      await type('forgot-code', '000000');

      await click('forgot-code-submit');
      (await vi.waitFor(() => http.expectOne(`${BASE}/verify`))).flush(
        { errorCode: 'OTP-401', message: 'x' },
        { status: 401, statusText: 'Unauthorized' },
      );

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(byTestId('forgot-code-error')?.textContent).toContain('not right, or it has expired');
      });
      expect(byTestId<HTMLInputElement>('forgot-code')!.value).toBe('');
      expect(byTestId('forgot-password-form')).toBeNull();
    });

    it('holds "send a new code" back until the wait is over, then sends one', async () => {
      await type('forgot-username', 'alice.trader');
      await type('forgot-email', 'alice@example.com');
      await click('forgot-request-submit');
      (await vi.waitFor(() => http.expectOne(`${BASE}/forgot`))).flush({ ...ANSWER, resendAfter: 1 }, ACCEPTED);
      await vi.waitFor(() => expect(byTestId('forgot-code-form')).toBeTruthy());
      const resend = byTestId<HTMLButtonElement>('forgot-resend')!;
      expect(resend.disabled).toBe(true);
      expect(resend.textContent).toContain('Send again in');

      await vi.waitFor(() => expect(resend.disabled).toBe(false), { timeout: 3000 });
      resend.click();
      const request = await vi.waitFor(() => http.expectOne(`${BASE}/resend`));
      expect(request.request.body).toEqual({ challengeId: 'c-9' });
      request.flush({ ...ANSWER, resendAfter: 30 }, ACCEPTED);

      await vi.waitFor(() =>
        expect(byTestId('forgot-code-notice')?.textContent).toContain('If your details matched an account'),
      );
      expect(byTestId<HTMLButtonElement>('forgot-resend')!.disabled).toBe(true);
    });

    it('lets the user change the details', async () => {
      await reachCodeStep();

      await click('forgot-start-again');

      expect(byTestId('forgot-request-form')).toBeTruthy();
      expect(byTestId('forgot-code-form')).toBeNull();
    });
  });

  describe('step 3: the new password', () => {
    it('shows every rule as a checklist that fills in as the password meets it', async () => {
      await reachPasswordStep();
      const met = () => [...root.querySelectorAll('[data-testid="forgot-password-rules"] .rule.is-met')].map((li) => li.getAttribute('data-rule'));

      expect(byTestId('forgot-password-rules')?.textContent).toContain('12-128 characters');
      expect(byTestId('forgot-password-rules')?.textContent).toContain('One capital letter');
      expect(byTestId('forgot-password-rules')?.textContent).toContain('One number');
      expect(byTestId('forgot-password-rules')?.textContent).toContain('One special symbol');
      expect(byTestId('forgot-password-rules')?.textContent).toContain('Different from your current password');
      expect(met()).not.toContain('upper');

      await type('forgot-new-password', 'Abcdefghijkl');
      expect(met()).toEqual(expect.arrayContaining(['length', 'upper']));
      expect(met()).not.toContain('digit');

      await type('forgot-new-password', GOOD_PASSWORD);
      expect(met()).toEqual(expect.arrayContaining(['length', 'upper', 'digit', 'symbol', 'different']));
    });

    it.each([
      ['too short', 'N3w!Pass', 'at least 12'],
      ['without a capital letter', 'n3w!password#1', 'capital letter'],
      ['without a number', 'New!Password#xx', 'number'],
      ['without a special symbol', 'New1Password2xx', 'special symbol'],
    ])('refuses a password %s and sends nothing', async (_name, password, reason) => {
      await reachPasswordStep();

      await type('forgot-new-password', password);
      await type('forgot-confirm-password', password);

      expect(byTestId('forgot-new-password-error')?.textContent?.toLowerCase()).toContain(reason);
      expect(byTestId<HTMLButtonElement>('forgot-password-submit')!.disabled).toBe(true);
      http.expectNone(`${BASE}/reset`);
    });

    it('needs the password typed twice, the same both times', async () => {
      await reachPasswordStep();

      await type('forgot-new-password', GOOD_PASSWORD);
      await type('forgot-confirm-password', 'N3w!Password#2');

      expect(byTestId('forgot-confirm-password-error')?.textContent).toContain('do not match');
      expect(byTestId<HTMLButtonElement>('forgot-password-submit')!.disabled).toBe(true);
    });

    it('blocks pasting into both password fields', async () => {
      await reachPasswordStep();

      const paste = new Event('paste', { bubbles: true, cancelable: true });
      byTestId('forgot-new-password')!.dispatchEvent(paste);
      await fixture.whenStable();

      expect(paste.defaultPrevented).toBe(true);
      expect(byTestId('forgot-clipboard-notice')?.textContent).toContain('Copy and paste are turned off');
    });

    it('sets the password with the reset token, signs nobody in, and reports who to sign in again', async () => {
      const completed = vi.fn();
      fixture.componentInstance.completed.subscribe(completed);
      await reachPasswordStep();
      await type('forgot-new-password', GOOD_PASSWORD);
      await type('forgot-confirm-password', GOOD_PASSWORD);

      await click('forgot-password-submit');
      const request = await vi.waitFor(() => http.expectOne(`${BASE}/reset`));
      expect(request.request.body).toEqual({ resetToken: 'reset-token', newPassword: GOOD_PASSWORD });
      request.flush(null, { status: 204, statusText: 'No Content' });

      await vi.waitFor(() => expect(completed).toHaveBeenCalledWith({ username: 'alice.trader' }));
      expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
    });

    it('says a password the same as the current one is not allowed, and lets another be tried', async () => {
      await reachPasswordStep();
      await type('forgot-new-password', GOOD_PASSWORD);
      await type('forgot-confirm-password', GOOD_PASSWORD);

      await click('forgot-password-submit');
      (await vi.waitFor(() => http.expectOne(`${BASE}/reset`))).flush(
        { errorCode: 'PWD-422', message: 'x' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(byTestId('forgot-password-error')?.textContent).toContain('different from your current password');
      });
      // still on the password step, the token not given up: another password goes with the same token
      await type('forgot-new-password', 'An0ther!Password#2');
      await type('forgot-confirm-password', 'An0ther!Password#2');
      await click('forgot-password-submit');
      expect((await vi.waitFor(() => http.expectOne(`${BASE}/reset`))).request.body.resetToken).toBe('reset-token');
    });

    it('starts again from the first step when the reset has expired', async () => {
      await reachPasswordStep();
      await type('forgot-new-password', GOOD_PASSWORD);
      await type('forgot-confirm-password', GOOD_PASSWORD);

      await click('forgot-password-submit');
      (await vi.waitFor(() => http.expectOne(`${BASE}/reset`))).flush(
        { errorCode: 'OTP-401', message: 'x' },
        { status: 401, statusText: 'Unauthorized' },
      );

      await vi.waitFor(() => expect(byTestId('forgot-request-form')).toBeTruthy());
      expect(byTestId('forgot-error')?.textContent).toContain('This reset has expired');
    });
  });
});
