import { Service, computed, signal } from '@angular/core';

/** Token pair returned by `POST /auth/login` (TokenResponseDto in the Auth service). */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  /** Lifetime of the access token in seconds. */
  readonly expiresIn: number;
}

/**
 * What the app needs from a sign-in response: how long the access token lives. The tokens themselves are never
 * read or kept here; the Auth service also puts them in HttpOnly cookies that JavaScript cannot see.
 */
export type SessionGrant = Pick<AuthTokens, 'expiresIn'> & Partial<AuthTokens>;

/** What the app remembers of a sign-in. Nothing secret: the tokens are in HttpOnly cookies. */
export interface StoredSession {
  readonly username: string;
  /** Epoch milliseconds after which the access cookie is no longer accepted (it can be renewed until the refresh cookie expires). */
  readonly expiresAt: number;
}

export const SESSION_STORAGE_KEY = 'auth.session';

/**
 * Tracks whether a user is signed in, for the UI. The actual credentials are the `access_token` and
 * `refresh_token` cookies the Auth service sets: the browser attaches them to API calls and no script, and
 * therefore no XSS bug, can read them. What lives here (and in localStorage, so a page reload and other tabs see
 * it) is only the username and when the access cookie runs out. `AuthService` starts and ends sessions and
 * `TokenRefresher` renews them.
 *
 * A stored session whose access cookie has run out is still restored: the refresh cookie (7 days) can mint a
 * new one on the first request. A session saved by an older version of the app, which kept the tokens in
 * localStorage, is discarded (and those tokens erased), so the user signs in once more.
 */
@Service()
export class SessionService {
  private readonly current = signal<StoredSession | null>(this.readStoredSession());

  readonly session = this.current.asReadonly();
  readonly isLoggedIn = computed(() => this.current() !== null);
  readonly username = computed(() => this.current()?.username ?? '');

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === SESSION_STORAGE_KEY || event.key === null) {
          this.syncFromStorage();
        }
      });
    }
  }

  start(username: string, grant: SessionGrant, now = Date.now()): void {
    const session: StoredSession = { username, expiresAt: now + grant.expiresIn * 1000 };
    this.current.set(session);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the in-memory session still works.
    }
  }

  /** Records a renewal; the user stays the same. */
  renew(grant: SessionGrant, now = Date.now()): void {
    const username = this.current()?.username;
    if (username !== undefined) {
      this.start(username, grant, now);
    }
  }

  /** Re-reads storage, which another tab may have changed (a renewal, or a sign-out). */
  syncFromStorage(): void {
    const stored = this.readStoredSession();
    const current = this.current();
    if (stored?.username !== current?.username || stored?.expiresAt !== current?.expiresAt) {
      this.current.set(stored);
    }
  }

  clear(): void {
    this.current.set(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Nothing persisted to remove.
    }
  }

  private readStoredSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<StoredSession> & Record<string, unknown>;
      const valid = typeof parsed.username === 'string' && typeof parsed.expiresAt === 'number';
      // An older version stored the tokens here. Erase them now rather than leave secrets in localStorage.
      const legacy = 'accessToken' in parsed || 'refreshToken' in parsed;
      if (!valid || legacy) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      return { username: parsed.username as string, expiresAt: parsed.expiresAt as number };
    } catch {
      return null;
    }
  }
}
