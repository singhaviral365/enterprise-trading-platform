import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { OtpChallenge } from '../../../api/generated/auth';
import { AuthService } from '../../../core/auth.service';
import { describeError } from '../../../core/errors/describe-error';
import { LOGIN_ERRORS } from '../../../core/errors/error-messages';
import { NoClipboard } from '../../../shared/directives/no-clipboard';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { SignedInEvent } from '../signed-in-event';

interface LoginModel {
  username: string;
  password: string;
}

interface CodeModel {
  code: string;
}

/**
 * Sign-in in two steps. First the username and password (`POST /auth/login`); the Auth service then emails a six-digit
 * code to the address on the account, and this form swaps to a code field (`POST /auth/login/verify`). Nobody is
 * signed in until the code is right: `signedIn` is emitted only then, once the session is stored.
 *
 * If the service has two-step sign-in switched off, the first step already signs in and the code field never appears.
 */
@Component({
  selector: 'app-login-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './login-form.html',
  styleUrl: '../auth-form.css',
})
export class LoginForm {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** A username to start with (just reset, or typed before choosing "forgot password"). */
  readonly initialUsername = input('');
  /** One line shown above the form, e.g. that the password was changed. */
  readonly notice = input('');

  readonly signedIn = output<SignedInEvent>();
  readonly switchToRegister = output<void>();
  /** "Forgot password?": carries the username typed so far. */
  readonly forgotPassword = output<string>();

  protected readonly model = signal<LoginModel>({ username: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.username, { message: 'Enter your username.' });
    required(path.password, { message: 'Enter your password.' });
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

  /** Where the form is: asking for the password, or for the code that was emailed. */
  protected readonly step = signal<'credentials' | 'code'>('credentials');
  protected readonly challenge = signal<OtpChallenge | null>(null);
  protected readonly serverError = signal('');
  protected readonly codeInfo = signal('');
  protected readonly resending = signal(false);
  /** Seconds until another code may be asked for. */
  protected readonly secondsUntilResend = signal(0);
  protected readonly showPassword = signal(false);
  protected readonly clipboardNotice = signal('');

  private countdown: ReturnType<typeof setInterval> | null = null;
  /** The username the code was asked for, so the session is stored under it even if the field is edited meanwhile. */
  private username = '';

  constructor() {
    effect(() => {
      const username = this.initialUsername();
      if (username) {
        untracked(() => this.model.update((current) => ({ ...current, username })));
      }
    });
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  protected onClipboardBlocked(): void {
    this.clipboardNotice.set('Copy and paste are turned off for password fields. Please type your password.');
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.loginForm, async () => {
      const { username, password } = this.model();
      try {
        const outcome = await this.auth.login(username.trim(), password);
        if (outcome.kind === 'signed-in') {
          this.signedIn.emit({ username: username.trim() });
        } else {
          this.username = username.trim();
          this.showCodeStep(outcome.challenge);
        }
      } catch (error) {
        this.serverError.set(describeError(error, { byStatus: LOGIN_ERRORS }));
      }
      return undefined;
    });
  }

  protected async onVerify(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    this.codeInfo.set('');
    const challenge = this.challenge();
    if (!challenge) {
      return;
    }
    await submit(this.codeForm, async () => {
      try {
        await this.auth.verifyLogin(this.username, challenge.challengeId, this.codeModel().code.trim());
        this.signedIn.emit({ username: this.username });
      } catch (error) {
        this.serverError.set(describeError(error));
        this.codeModel.set({ code: '' });
      }
      return undefined;
    });
  }

  protected async onResend(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge || this.resending() || this.secondsUntilResend() > 0) {
      return;
    }
    this.serverError.set('');
    this.resending.set(true);
    try {
      this.showCodeStep(await this.auth.resendLoginCode(challenge.challengeId), 'We sent you a new code.');
    } catch (error) {
      this.serverError.set(describeError(error));
    } finally {
      this.resending.set(false);
    }
  }

  /** Back to the password step, e.g. a different account, or the code never arrived. */
  protected onBack(): void {
    this.stopCountdown();
    this.challenge.set(null);
    this.codeModel.set({ code: '' });
    this.serverError.set('');
    this.codeInfo.set('');
    this.model.update((current) => ({ ...current, password: '' }));
    this.step.set('credentials');
  }

  protected onForgotPassword(): void {
    this.forgotPassword.emit(this.model().username.trim());
  }

  private showCodeStep(challenge: OtpChallenge, info = ''): void {
    this.challenge.set(challenge);
    this.codeModel.set({ code: '' });
    this.codeInfo.set(info);
    this.step.set('code');
    this.startCountdown(challenge.resendAfter);
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
