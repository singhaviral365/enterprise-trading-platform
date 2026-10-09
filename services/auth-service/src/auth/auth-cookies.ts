import type { Response } from 'express';
import { refreshTokenTtlSeconds, requiredText } from '../config/required-settings';

/** The signed access JWT. Sent on every request to the platform; JavaScript can never read it (HttpOnly). */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * The opaque refresh token. Scoped to /auth so the browser only attaches it to refresh and logout calls, never to
 * the trading APIs. The database holds only its SHA-256 hash.
 */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/auth';

/**
 * A header a cross-site form or image cannot add: browsers only let a page send it via XHR/fetch, which the CORS
 * allow-list restricts to our own origins. Required whenever a state-changing request is authenticated by a
 * cookie alone, as a second line of defence next to SameSite.
 */
export const CSRF_HEADER = 'x-requested-with';

export type SameSiteMode = 'strict' | 'lax' | 'none';

export interface CookieSettings {
  readonly secure: boolean;
  readonly sameSite: SameSiteMode;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Lifetime of the access token in seconds. */
  readonly expiresIn: number;
}

/**
 * `AUTH_COOKIE_SECURE` (empty in the file: on in production, off in development so http://localhost works) and
 * `AUTH_COOKIE_SAMESITE` (`strict`, `lax` or `none`; `none` is for a front end on another site and needs Secure). Both come from
 * auth.cookie in config/application.yml.
 */
export function cookieSettings(env: NodeJS.ProcessEnv = process.env): CookieSettings {
  const configured = requiredText('AUTH_COOKIE_SAMESITE', 'auth.cookie.samesite', env).toLowerCase();
  if (configured !== 'lax' && configured !== 'none' && configured !== 'strict') {
    throw new Error(`auth.cookie.samesite must be strict, lax or none (got "${configured}").`);
  }
  const sameSite: SameSiteMode = configured;
  const secure = env.AUTH_COOKIE_SECURE !== undefined ? env.AUTH_COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
  // Browsers refuse SameSite=None without Secure, so never emit that combination.
  return { secure: secure || sameSite === 'none', sameSite };
}

export function refreshTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return refreshTokenTtlSeconds(env);
}

/** Reads one cookie out of a raw `Cookie` header; undefined when absent. */
export function readCookie(cookieHeader: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!raw) {
    return undefined;
  }
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return value ? decodeURIComponent(value) : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function hasCsrfHeader(headers: Record<string, string | string[] | undefined> | undefined): boolean {
  const value = headers?.[CSRF_HEADER];
  return typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) && value.length > 0;
}

/** Puts the token pair into HttpOnly cookies. The body of the response is unchanged. */
export function setAuthCookies(
  response: Response,
  tokens: IssuedTokens,
  settings: CookieSettings = cookieSettings(),
  refreshTtl: number = refreshTtlSeconds(),
): void {
  response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: settings.secure,
    sameSite: settings.sameSite,
    path: '/',
    maxAge: tokens.expiresIn * 1000,
  });
  response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: settings.secure,
    sameSite: settings.sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtl * 1000,
  });
}

export function clearAuthCookies(response: Response, settings: CookieSettings = cookieSettings()): void {
  const common = { httpOnly: true, secure: settings.secure, sameSite: settings.sameSite } as const;
  response.clearCookie(ACCESS_TOKEN_COOKIE, { ...common, path: '/' });
  response.clearCookie(REFRESH_TOKEN_COOKIE, { ...common, path: REFRESH_COOKIE_PATH });
}
