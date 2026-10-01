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
 * Keeps the user signed in by trading the refresh token for a new token pair, and ends the session
 * properly when that is no longer possible.
 *
 * The Auth service rotates refresh tokens and treats a token presented twice as theft (it revokes the whole
 * chain). So a refresh must never run twice for the same token:
 *  - concurrent callers in this tab share one in-flight request;
 *  - across tabs, a Web Lock serialises refreshes and the loser adopts the winner's tokens from storage.
 */
@Service()
export class TokenRefresher {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  private inFlight: Promise<string | null> | null = null;

  /**
   * Resolves with a usable access token, or null if there is none to be had.
   * `staleToken` is the token the caller just found to be expired or rejected.
   */
  refresh(staleToken: string | null): Promise<string | null> {
    this.inFlight ??= this.runExclusive(staleToken).finally(() => {
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

  private runExclusive(staleToken: string | null): Promise<string | null> {
    const run = () => this.doRefresh(staleToken);
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('auth.refresh', run)
      : run();
  }

  private async doRefresh(staleToken: string | null): Promise<string | null> {
    // Another tab may have refreshed (or signed out) while this one waited.
    this.session.syncFromStorage();
    const current = this.session.session();
    if (!current) {
      return null;
    }
    if (staleToken !== null && current.accessToken !== staleToken) {
      return current.accessToken;
    }
    try {
      const tokens = await firstValueFrom(this.api.refresh({ refreshToken: current.refreshToken }));
      this.session.renew(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof HttpErrorResponse && REFUSED.has(error.status)) {
        this.endSession();
      }
      // A network or server failure is not proof the session is over: keep it and let the caller's own
      // request report the problem.
      return null;
    }
  }
}
