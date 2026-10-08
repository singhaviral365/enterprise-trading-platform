import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, output, signal } from '@angular/core';
import { FormField, form, maxLength, minLength, required, submit, validate } from '@angular/forms/signals';
import { AuthService } from '../../../../core/auth.service';
import { describeError, errorCodeOf } from '../../../../core/errors/describe-error';
import { NotificationService } from '../../../../core/notification.service';
import { SessionService } from '../../../../core/session.service';
import { PASSWORD_MAX, PASSWORD_MIN, passwordRules } from '../../../../features/auth/credential-rules';
import { NoClipboard } from '../../../../shared/directives/no-clipboard';
import { Spinner } from '../../../../shared/ui/spinner/spinner';

interface PasswordModel {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * The change-password form inside the profile pane.
 *
 * The current and the new password are typed together. The server checks the current one first: a wrong one says how many
 * tries are left, and the third wrong one ends this session (`PWD-423`), so the form signs the user out and tells the pane.
 * A right one changes the password; the server keeps this session going and ends every other.
 */
@Component({
  selector: 'app-change-password-form',
  imports: [FormField, NoClipboard, Spinner],
  templateUrl: './change-password-form.html',
  styleUrl: '../../../../features/auth/auth-form.css',
})
export class ChangePasswordForm {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly notifications = inject(NotificationService);

  /** The password was changed. */
  readonly changed = output<void>();
  /** The user chose Back. */
  readonly cancelled = output<void>();
  /** The session ended here (too many wrong passwords); the pane closes and the header sends the user home. */
  readonly signedOut = output<void>();

  protected readonly serverError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly clipboardNotice = signal('');

  protected readonly model = signal<PasswordModel>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  protected readonly passwordForm = form(this.model, (path) => {
    required(path.currentPassword, { message: 'Enter your current password.' });
    required(path.newPassword, { message: 'Choose a new password.' });
    minLength(path.newPassword, PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters.` });
    maxLength(path.newPassword, PASSWORD_MAX, { message: `Password must be ${PASSWORD_MAX} characters or fewer.` });
    validate(path.newPassword, ({ value }) => {
      const unmet = value()
        ? passwordRules(value(), this.session.username()).find((rule) => rule.id !== 'length' && !rule.met)
        : undefined;
      return unmet ? { kind: 'passwordRule', message: `Password needs: ${unmet.label.toLowerCase()}.` } : undefined;
    });
    required(path.confirmPassword, { message: 'Type the new password again.' });
    validate(path.confirmPassword, ({ value, valueOf }) =>
      value() && value() !== valueOf(path.newPassword)
        ? { kind: 'mismatch', message: 'The two passwords do not match.' }
        : undefined,
    );
  });

  protected readonly passwordChecklist = computed(() => passwordRules(this.model().newPassword, this.session.username()));

  protected onClipboardBlocked(): void {
    this.clipboardNotice.set('Copy and paste are turned off for password fields. Please type your password.');
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.passwordForm, async () => {
      const { currentPassword, newPassword } = this.model();
      try {
        await this.auth.changePassword(currentPassword, newPassword);
        this.notifications.success('Password changed. Any other device was signed out.');
        this.changed.emit();
      } catch (error) {
        const code = errorCodeOf(error);
        if (code === 'PWD-423') {
          // The third wrong password: the server has ended this session, so end it here too.
          this.auth.logout();
          this.notifications.error(describeError(error));
          this.signedOut.emit();
          return undefined;
        }
        this.serverError.set(describeError(error) + this.triesLeft(error));
        if (code === 'PWD-403') {
          this.model.update((current) => ({ ...current, currentPassword: '' }));
        }
      }
      return undefined;
    });
  }

  private triesLeft(error: unknown): string {
    if (error instanceof HttpErrorResponse && errorCodeOf(error) === 'PWD-403') {
      const left = (error.error as { attemptsLeft?: unknown }).attemptsLeft;
      if (typeof left === 'number') {
        return left === 1 ? ' You have 1 try left.' : ` You have ${left} tries left.`;
      }
    }
    return '';
  }

}
