import { Service, signal } from '@angular/core';

/**
 * `account` is the trading-account set-up step shown after sign-in when no account is linked yet. `forgot` is the
 * password reset (username and email, the emailed code, then the new password).
 */
export type AuthMode = 'login' | 'register' | 'account' | 'forgot';

/** Opens the sign-in / register dialog from anywhere (header button, home page, dashboard). */
@Service()
export class AuthDialogService {
  private readonly openState = signal(false);
  private readonly modeState = signal<AuthMode>('login');
  private readonly emailState = signal('');
  private readonly returnUrlState = signal<string | null>(null);
  private readonly usernameState = signal('');
  private readonly noticeState = signal('');

  readonly isOpen = this.openState.asReadonly();
  readonly mode = this.modeState.asReadonly();
  /** Email to pre-fill in the account step (the one just used to register, if any). */
  readonly prefillEmail = this.emailState.asReadonly();
  /** Page the guard interrupted; the dialog sends the user there after sign-in. Null means the dashboard. */
  readonly returnUrl = this.returnUrlState.asReadonly();
  /** A username to put in the sign-in form (the one just reset, or the one typed before choosing "forgot password"). */
  readonly prefillUsername = this.usernameState.asReadonly();
  /** One line shown above the sign-in form, e.g. that the password was changed. */
  readonly notice = this.noticeState.asReadonly();

  open(mode: AuthMode = 'login', returnUrl: string | null = null): void {
    this.modeState.set(mode);
    if (mode !== 'account') {
      this.returnUrlState.set(returnUrl);
    }
    if (mode !== 'account') {
      this.emailState.set('');
    }
    this.usernameState.set('');
    this.noticeState.set('');
    this.openState.set(true);
  }

  /** Back to the sign-in form, optionally with a username filled in and a line saying what just happened. */
  returnToLogin(username = '', notice = ''): void {
    this.usernameState.set(username);
    this.noticeState.set(notice);
    this.modeState.set('login');
  }

  /** To the password reset, carrying over the username typed so far. */
  startPasswordReset(username = ''): void {
    this.usernameState.set(username);
    this.noticeState.set('');
    this.modeState.set('forgot');
  }

  setMode(mode: AuthMode): void {
    this.modeState.set(mode);
  }

  setPrefillEmail(email: string): void {
    this.emailState.set(email);
  }

  close(): void {
    this.openState.set(false);
    this.returnUrlState.set(null);
    this.usernameState.set('');
    this.noticeState.set('');
  }
}
