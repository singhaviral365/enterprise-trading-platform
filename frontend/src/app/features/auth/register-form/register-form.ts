import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
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
import { OtpChallenge } from '../../../api/generated/auth';
import { AuthService } from '../../../core/auth.service';
import { describeError } from '../../../core/errors/describe-error';
import { REGISTER_ERRORS } from '../../../core/errors/error-messages';
import { NoClipboard } from '../../../shared/directives/no-clipboard';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  passwordRules,
  usernameProblem,
  usernameRules,
} from '../credential-rules';
import { SignedInEvent } from '../signed-in-event';

interface RegisterModel {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * Registers in two steps. First the details (`POST /auth/register`): nothing is created, and a 6-digit code is emailed to
 * the address typed. This form then swaps to a code field (`POST /auth/register/verify`), and only a right code creates the
 * login. So an address nobody can read never becomes a login. Then it reports it with `registered`; the dialog sends the new user to the
 * sign-in form (which asks for the emailed code), and the trading-account details follow that sign-in. Registering does
 * not sign anyone in: with two-step sign-in a session needs a code, and one sent the moment a login is created would
 * only be a second email. The rules (credential-rules.ts) mirror RegisterDto in the Auth service.
 */
@Component({
  selector: 'app-register-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './register-form.html',
  styleUrl: '../auth-form.css',
})
export class RegisterForm {
  private readonly auth = inject(AuthService);

  readonly registered = output<SignedInEvent>();
  readonly switchToLogin = output<void>();

  protected readonly model = signal<RegisterModel>({ username: '', email: '', password: '', confirmPassword: '' });
  protected readonly registerForm = form(this.model, (path) => {
    required(path.username, { message: 'Choose a username.' });
    minLength(path.username, USERNAME_MIN, { message: `Username must be at least ${USERNAME_MIN} characters.` });
    maxLength(path.username, USERNAME_MAX, { message: `Username must be ${USERNAME_MAX} characters or fewer.` });
    validate(path.username, ({ value }) => {
      const problem = usernameProblem(value());
      return problem ? { kind: 'usernameFormat', message: problem } : undefined;
    });
    required(path.email, { message: 'Enter your email address.' });
    email(path.email, { message: 'Enter a valid email address, like name@example.com.' });
    maxLength(path.email, 255, { message: 'Email must be 255 characters or fewer.' });
    required(path.password, { message: 'Choose a password.' });
    minLength(path.password, PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters.` });
    maxLength(path.password, PASSWORD_MAX, { message: `Password must be ${PASSWORD_MAX} characters or fewer.` });
    // Character-type rules and "different from username" (the length rule is reported above).
    validate(path.password, ({ value, valueOf }) => {
      const unmet = value()
        ? passwordRules(value(), valueOf(path.username)).find((rule) => rule.id !== 'length' && !rule.met)
        : undefined;
      if (!unmet) {
        return undefined;
      }
      const message =
        unmet.id === 'different'
          ? 'Password must be different from your username.'
          : `Password needs ${unmet.label.charAt(0).toLowerCase()}${unmet.label.slice(1)}.`;
      return { kind: `password-${unmet.id}`, message };
    });
    required(path.confirmPassword, { message: 'Re-enter your password.' });
    validate(path.confirmPassword, ({ value, valueOf }) =>
      value() && value() !== valueOf(path.password)
        ? { kind: 'mismatch', message: 'Passwords do not match.' }
        : undefined,
    );
  });
  protected readonly codeModel = signal<{ code: string }>({ code: '' });
  protected readonly codeForm = form(this.codeModel, (path) => {
    required(path.code, { message: 'Enter the 6-digit code from your email.' });
    validate(path.code, ({ value }) =>
      value().trim() && !/^\d{6}$/.test(value().trim())
        ? { kind: 'format', message: 'The code is 6 digits.' }
        : undefined,
    );
  });
  /** Where the form is: asking for the details, or for the code that was emailed. */
  protected readonly step = signal<'details' | 'code'>('details');
  protected readonly challenge = signal<OtpChallenge | null>(null);
  protected readonly codeInfo = signal('');
  protected readonly resending = signal(false);
  protected readonly secondsUntilResend = signal(0);
  private countdown: ReturnType<typeof setInterval> | null = null;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly serverError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly clipboardNotice = signal('');
  /** Live checklists under the username and password fields. */
  protected readonly usernameChecklist = computed(() => usernameRules(this.model().username));
  protected readonly passwordChecklist = computed(() =>
    passwordRules(this.model().password, this.model().username),
  );

  protected onClipboardBlocked(): void {
    this.clipboardNotice.set('Copy and paste are turned off for password fields. Please type your password.');
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.registerForm, async () => {
      const username = this.model().username.trim();
      const password = this.model().password;
      const emailAddress = this.model().email.trim();
      try {
        const outcome = await this.auth.register({ username, password, email: emailAddress });
        if (outcome.kind === 'registered') {
          this.registered.emit({ username, email: emailAddress });
        } else {
          this.showCodeStep(outcome.challenge);
        }
      } catch (error) {
        this.serverError.set(describeError(error, { byStatus: REGISTER_ERRORS }));
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
        await this.auth.verifyRegistration(challenge.challengeId, this.codeModel().code.trim());
        this.stopCountdown();
        this.registered.emit({ username: this.model().username.trim(), email: this.model().email.trim() });
      } catch (error) {
        this.serverError.set(describeError(error, { byStatus: REGISTER_ERRORS }));
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
      this.showCodeStep(await this.auth.resendRegistrationCode(challenge.challengeId), 'We sent you a new code.');
    } catch (error) {
      this.serverError.set(describeError(error));
    } finally {
      this.resending.set(false);
    }
  }

  /** Back to the details, e.g. a mistyped address: nothing was created, so nothing needs undoing. */
  protected onBack(): void {
    this.stopCountdown();
    this.challenge.set(null);
    this.codeModel.set({ code: '' });
    this.serverError.set('');
    this.codeInfo.set('');
    this.step.set('details');
  }

  private showCodeStep(challenge: OtpChallenge, info = ''): void {
    this.challenge.set(challenge);
    this.codeModel.set({ code: '' });
    this.codeInfo.set(info);
    this.step.set('code');
    this.stopCountdown();
    this.secondsUntilResend.set(challenge.resendAfter);
    if (challenge.resendAfter > 0) {
      this.countdown = setInterval(() => {
        this.secondsUntilResend.update((left) => Math.max(0, left - 1));
        if (this.secondsUntilResend() === 0) {
          this.stopCountdown();
        }
      }, 1000);
    }
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  private stopCountdown(): void {
    if (this.countdown !== null) {
      clearInterval(this.countdown);
      this.countdown = null;
    }
  }
}
