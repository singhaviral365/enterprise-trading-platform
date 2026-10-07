import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { AuthService } from '../../../core/auth.service';
import { describeError, errorCodeOf } from '../../../core/errors/describe-error';
import { NoClipboard } from '../../../shared/directives/no-clipboard';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { PASSWORD_MAX, PASSWORD_MIN, passwordRules } from '../credential-rules';

type Step = 'request' | 'code' | 'password';

interface RequestModel {
  username: string;
  email: string;
}

interface CodeModel {
  code: string;
}

interface PasswordModel {
  password: string;
  confirmPassword: string;
}

/** What the form emits when the password has been changed: who, so the sign-in form can start with them filled in. */
export interface PasswordResetEvent {
  readonly username: string;
}

/**
 * Forgot password, in three steps, all against the Auth service:
 *
 * 1. The username and the email on the account. The answer is always the same, so this screen cannot be used to find out
 *    who is registered: it says "if these details match an account, a code is on its way" either way.
 * 2. The six-digit code that was emailed.
 * 3. A new password, which must follow the registration rules (the checklist shows each one), must be typed twice, and
 *    must differ from the current one (the server decides that, and says so).
 *
 * Nobody is signed in at the end: `completed` hands back to the sign-in form, and signing in needs the new password and
 * a new emailed code.
 */
@Component({
  selector: 'app-forgot-password-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './forgot-password-form.html',
  styleUrl: '../auth-form.css',
})
export class ForgotPasswordForm {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** A username to start with (the one typed on the sign-in form). */
  readonly initialUsername = input('');

  readonly completed = output<PasswordResetEvent>();
  readonly backToLogin = output<void>();

  protected readonly step = signal<Step>('request');
  protected readonly serverError = signal('');
  protected readonly info = signal('');
  protected readonly resending = signal(false);
  protected readonly secondsUntilResend = signal(0);
  protected readonly showPassword = signal(false);
  protected readonly clipboardNotice = signal('');

  protected readonly requestModel = signal<RequestModel>({ username: '', email: '' });
  protected readonly requestForm = form(this.requestModel, (path) => {
    required(path.username, { message: 'Enter your username.' });
    required(path.email, { message: 'Enter the email address on your account.' });
    email(path.email, { message: 'Enter a valid email address, like name@example.com.' });
    maxLength(path.email, 255, { message: 'Email must be 255 characters or fewer.' });
  });

  protected readonly codeModel = signal<CodeModel>({ code: '' });
  protected readonly codeForm = form(this.codeModel, (path) => {
    required(path.code, { message: 'Enter the 6-digit code from your email.' });
    validate(path.code, ({ value }) =>
      value().trim() && !/^\d{6}$/.test(value().trim())
        ? { kind: 'format', message: 'The code is 6 digits.' }
        : undefined,
    );
  });

  protected readonly passwordModel = signal<PasswordModel>({ password: '', confirmPassword: '' });
  protected readonly passwordForm = form(this.passwordModel, (path) => {
    required(path.password, { message: 'Choose a new password.' });
    minLength(path.password, PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters.` });
    maxLength(path.password, PASSWORD_MAX, { message: `Password must be ${PASSWORD_MAX} characters or fewer.` });
    // Character-type rules and "different from the username"; the length rule is reported above.
    validate(path.password, ({ value }) => {
      const unmet = value()
        ? passwordRules(value(), this.requestModel().username).find((rule) => rule.id !== 'length' && !rule.met)
        : undefined;
      return unmet ? { kind: 'passwordRule', message: `Password needs: ${unmet.label.toLowerCase()}.` } : undefined;
    });
    required(path.confirmPassword, { message: 'Type the new password again.' });
    validate(path.confirmPassword, ({ value, valueOf }) =>
      value() && value() !== valueOf(path.password)
        ? { kind: 'mismatch', message: 'The two passwords do not match.' }
        : undefined,
    );
  });

  /** Each password rule and whether the new password meets it, for the live checklist. */
  protected readonly passwordChecklist = computed(() =>
    passwordRules(this.passwordModel().password, this.requestModel().username),
  );

  private challengeId = '';
  private resetToken = '';
  private countdown: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const username = this.initialUsername();
      if (username) {
        untracked(() => this.requestModel.update((current) => ({ ...current, username })));
      }
    });
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  protected onClipboardBlocked(): void {
    this.clipboardNotice.set('Copy and paste are turned off for password fields. Please type your password.');
  }

  // ---- 1. username and email ------------------------------------------------------------------------------------

  protected async onRequest(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.requestForm, async () => {
      const { username, email: address } = this.requestModel();
      try {
        const answer = await this.auth.requestPasswordReset(username.trim(), address.trim());
        this.challengeId = answer.challengeId;
        this.codeModel.set({ code: '' });
        this.step.set('code');
        this.startCountdown(answer.resendAfter);
      } catch (error) {
        this.serverError.set(describeError(error));
      }
      return undefined;
    });
  }

  // ---- 2. the emailed code --------------------------------------------------------------------------------------

  protected async onVerify(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    this.info.set('');
    await submit(this.codeForm, async () => {
      try {
        const answer = await this.auth.verifyResetCode(this.challengeId, this.codeModel().code.trim());
        this.resetToken = answer.resetToken;
        this.stopCountdown();
        this.passwordModel.set({ password: '', confirmPassword: '' });
        this.step.set('password');
      } catch (error) {
        this.serverError.set(describeError(error));
        this.codeModel.set({ code: '' });
      }
      return undefined;
    });
  }

  protected async onResend(): Promise<void> {
    if (this.resending() || this.secondsUntilResend() > 0) {
      return;
    }
    this.serverError.set('');
    this.resending.set(true);
    try {
      const answer = await this.auth.resendResetCode(this.challengeId);
      this.info.set('If your details matched an account, we sent a new code.');
      this.startCountdown(answer.resendAfter);
    } catch (error) {
      this.serverError.set(describeError(error));
    } finally {
      this.resending.set(false);
    }
  }

  // ---- 3. the new password --------------------------------------------------------------------------------------

  protected async onReset(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.passwordForm, async () => {
      try {
        await this.auth.resetPassword(this.resetToken, this.passwordModel().password);
        this.completed.emit({ username: this.requestModel().username.trim() });
      } catch (error) {
        if (errorCodeOf(error) === 'OTP-401') {
          // The reset window closed (or the token was already used): nothing to retry here, so start again.
          this.serverError.set('This reset has expired. Please start again.');
          this.step.set('request');
          this.resetToken = '';
        } else {
          // Includes "same as your current password": the token is not used up, so another password can be tried.
          this.serverError.set(describeError(error));
        }
      }
      return undefined;
    });
  }

  protected onStartAgain(): void {
    this.stopCountdown();
    this.challengeId = '';
    this.resetToken = '';
    this.serverError.set('');
    this.info.set('');
    this.step.set('request');
  }

  private startCountdown(seconds: number): void {
    this.stopCountdown();
    this.secondsUntilResend.set(seconds);
    if (seconds <= 0) {
      return;
    }
    this.countdown = setInterval(() => {
      this.secondsUntilResend.update((left) => Math.max(0, left - 1));
      if (this.secondsUntilResend() === 0) {
        this.stopCountdown();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdown !== null) {
      clearInterval(this.countdown);
      this.countdown = null;
    }
  }
}
