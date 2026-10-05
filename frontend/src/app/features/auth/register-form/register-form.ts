import { Component, computed, inject, output, signal } from '@angular/core';
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
 * Creates a login via `POST /auth/register`, then signs straight in; the dialog then asks for the
 * trading-account details. The rules (credential-rules.ts) mirror RegisterDto in the Auth service.
 */
@Component({
  selector: 'app-register-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './register-form.html',
  styleUrl: '../auth-form.css',
})
export class RegisterForm {
  private readonly auth = inject(AuthService);

  readonly signedIn = output<SignedInEvent>();
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
        await this.auth.register({ username, password, email: emailAddress });
        await this.auth.login(username, password);
        this.signedIn.emit({ username, email: emailAddress });
      } catch (error) {
        this.serverError.set(describeError(error, { byStatus: REGISTER_ERRORS }));
      }
      return undefined;
    });
  }
}
