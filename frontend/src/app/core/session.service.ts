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
 * session. The layout only reads `isLoggedIn`; `AuthService` is the one that starts and ends sessions.
 */
@Service()
export class SessionService {
  private readonly current = signal<StoredSession | null>(this.readStoredSession());

  readonly session = this.current.asReadonly();
  readonly isLoggedIn = computed(() => this.current() !== null);
  readonly username = computed(() => this.current()?.username ?? '');
  readonly accessToken = computed(() => this.current()?.accessToken ?? null);

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
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > Date.now();
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
