import { Component, inject, output, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
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

/** Username/password sign-in against `POST /auth/login`. Emits `signedIn` once the session is stored. */
@Component({
  selector: 'app-login-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './login-form.html',
  styleUrl: '../auth-form.css',
})
export class LoginForm {
  private readonly auth = inject(AuthService);

  readonly signedIn = output<SignedInEvent>();
  readonly switchToRegister = output<void>();

  protected readonly model = signal<LoginModel>({ username: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.username, { message: 'Enter your username.' });
    required(path.password, { message: 'Enter your password.' });
  });
  protected readonly serverError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly clipboardNotice = signal('');

  protected onClipboardBlocked(): void {
    this.clipboardNotice.set('Copy and paste are turned off for password fields. Please type your password.');
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.loginForm, async () => {
      const { username, password } = this.model();
      try {
        await this.auth.login(username.trim(), password);
        this.signedIn.emit({ username: username.trim() });
      } catch (error) {
        this.serverError.set(describeError(error, { byStatus: LOGIN_ERRORS }));
      }
      return undefined;
    });
  }
}
