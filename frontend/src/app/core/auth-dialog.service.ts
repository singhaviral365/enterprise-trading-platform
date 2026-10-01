import { Service, signal } from '@angular/core';

/** `account` is the trading-account set-up step shown after sign-in when no account is linked yet. */
export type AuthMode = 'login' | 'register' | 'account';

/** Opens the sign-in / register dialog from anywhere (header button, home page, dashboard). */
@Service()
export class AuthDialogService {
  private readonly openState = signal(false);
  private readonly modeState = signal<AuthMode>('login');
  private readonly emailState = signal('');

  readonly isOpen = this.openState.asReadonly();
  readonly mode = this.modeState.asReadonly();
  /** Email to pre-fill in the account step (the one just used to register, if any). */
  readonly prefillEmail = this.emailState.asReadonly();

  open(mode: AuthMode = 'login'): void {
    this.modeState.set(mode);
    if (mode !== 'account') {
      this.emailState.set('');
    }
    this.openState.set(true);
  }

  setMode(mode: AuthMode): void {
    this.modeState.set(mode);
  }

  setPrefillEmail(email: string): void {
    this.emailState.set(email);
  }

  close(): void {
    this.openState.set(false);
  }
}
