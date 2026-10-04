import { HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from '../../api/auth-api.service';
import { NotificationService } from '../notification.service';
import { SessionService } from '../session.service';

/** Statuses that mean the refresh token itself was refused (expired, revoked, reused, malformed). */
const REFUSED = new Set([400, 401, 403, 422]);

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Please sign in again.';

/**
 * Keeps the user signed in by asking the Auth service to renew the session, and ends it properly when that is
 * no longer possible. The refresh token never passes through JavaScript: it is an HttpOnly cookie the browser
 * sends to `/auth/refresh`, and the new pair comes back as cookies again.
 *
 * The Auth service rotates refresh tokens and treats a token presented twice as theft (it revokes the whole
 * chain). So a refresh must never run twice for the same token:
 *  - concurrent callers in this tab share one in-flight request;
 *  - across tabs, a Web Lock serialises refreshes and the loser sees that the session was already renewed
 *    (its `expiresAt` moved on in storage) and skips its own.
 */
@Service()
export class TokenRefresher {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  private inFlight: Promise<boolean> | null = null;

  /**
   * Resolves true when the session has a fresh access cookie (renewed now, or already by another request or tab),
   * false when there is none to be had. `staleExpiresAt` is the `expiresAt` the caller saw when it found the
   * access cookie expired or rejected; if the stored one has moved on, someone else already renewed it.
   */
  refresh(staleExpiresAt: number | null): Promise<boolean> {
    this.inFlight ??= this.runExclusive(staleExpiresAt).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Ends the session: forgets the tokens, tells the user and sends them home. */
  endSession(): void {
    if (!this.session.isLoggedIn()) {
      return;
    }
    this.session.clear();
    this.notifications.warning(SESSION_ENDED_MESSAGE);
    void this.router.navigateByUrl('/');
  }

  private runExclusive(staleExpiresAt: number | null): Promise<boolean> {
    const run = () => this.doRefresh(staleExpiresAt);
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('auth.refresh', run)
      : run();
  }

  private async doRefresh(staleExpiresAt: number | null): Promise<boolean> {
    // Another tab may have refreshed (or signed out) while this one waited.
    this.session.syncFromStorage();
    const current = this.session.session();
    if (!current) {
      return false;
    }
    if (staleExpiresAt !== null && current.expiresAt !== staleExpiresAt) {
      return true;
    }
    try {
      const tokens = await firstValueFrom(this.api.refresh());
      this.session.renew(tokens);
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && REFUSED.has(error.status)) {
        this.endSession();
      }
      // A network or server failure is not proof the session is over: keep it and let the caller's own
      // request report the problem.
      return false;
    }
  }
}
