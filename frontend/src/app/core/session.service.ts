import { Service, signal } from '@angular/core';

/**
 * Minimal login-state holder that drives the layout (sidebar visibility, header buttons).
 *
 * TODO: wire `login()` / `logout()` to the real Auth service once it exists. Only the
 * `isLoggedIn` signal is read by the layout, so the rest of the app does not need to change.
 */
@Service()
export class SessionService {
  private readonly loggedIn = signal(false);

  readonly isLoggedIn = this.loggedIn.asReadonly();

  login(): void {
    this.loggedIn.set(true);
  }

  logout(): void {
    this.loggedIn.set(false);
  }
}
