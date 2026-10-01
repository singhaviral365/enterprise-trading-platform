import { Service, computed, signal } from '@angular/core';

/** Token pair returned by `POST /auth/login` (TokenResponseDto in the Auth service). */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  /** Lifetime of the access token in seconds. */
  readonly expiresIn: number;
}

export interface StoredSession {
  readonly username: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds after which the access token is no longer accepted. */
  readonly expiresAt: number;
}

export const SESSION_STORAGE_KEY = 'auth.session';

/**
 * Holds the signed-in user's tokens and persists them to localStorage so a page reload keeps the
 * session. The layout only reads `isLoggedIn`; `AuthService` is the one that starts and ends sessions, and
 * `TokenRefresher` renews the tokens while the refresh token is still good.
 *
 * A stored session whose access token has run out is still restored: the refresh token (7 days) can mint a
 * new one on the first request. Other tabs share the same storage, so a sign-in, a token renewal or a
 * sign-out in one tab is picked up by the rest.
 */
@Service()
export class SessionService {
  private readonly current = signal<StoredSession | null>(this.readStoredSession());

  readonly session = this.current.asReadonly();
  readonly isLoggedIn = computed(() => this.current() !== null);
  readonly username = computed(() => this.current()?.username ?? '');
  readonly accessToken = computed(() => this.current()?.accessToken ?? null);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === SESSION_STORAGE_KEY || event.key === null) {
          this.syncFromStorage();
        }
      });
    }
  }

  start(username: string, tokens: AuthTokens, now = Date.now()): void {
    const session: StoredSession = {
      username,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now + tokens.expiresIn * 1000,
    };
    this.current.set(session);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the in-memory session still works.
    }
  }

  /** Swaps in the tokens from a refresh; the user stays the same. */
  renew(tokens: AuthTokens, now = Date.now()): void {
    const username = this.current()?.username;
    if (username !== undefined) {
      this.start(username, tokens, now);
    }
  }

  /** Re-reads storage, which another tab may have changed (renewed tokens, or signed out). */
  syncFromStorage(): void {
    const stored = this.readStoredSession();
    const current = this.current();
    if (stored?.accessToken !== current?.accessToken || stored?.refreshToken !== current?.refreshToken) {
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
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      const valid =
        typeof parsed.username === 'string' &&
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        typeof parsed.expiresAt === 'number';
      if (!valid) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      return parsed as StoredSession;
    } catch {
      return null;
    }
  }
}
