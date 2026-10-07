import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AUTH_API_BASE_URL, TRADE_API_BASE_URL } from '../../api/api.config';
import { TokenRefresher } from '../auth/token-refresher';
import { SessionService } from '../session.service';

export interface ProtectedApi {
  origin: string;
  /** When set, only paths starting with one of these prefixes carry the session. */
  pathPrefixes?: readonly string[];
}

/**
 * Allow-list: the session cookies go only to these platform APIs, nothing else. Built from the same base URLs the
 * generated clients use, so the two cannot drift apart. A relative base URL (the Trade API behind the dev proxy)
 * resolves to the page's own origin.
 */
export function protectedApis(): readonly ProtectedApi[] {
  return [
    // Trade REST API, and the market endpoint that lives under the same prefix
    { origin: new URL(TRADE_API_BASE_URL, window.location.origin).origin, pathPrefixes: ['/api/v1/'] },
    // Auth API: only the protected route; the rest are in `sessionRoutes` below
    { origin: new URL(AUTH_API_BASE_URL, window.location.origin).origin, pathPrefixes: ['/auth/me'] },
  ];
}

/**
 * The Auth service calls that set or clear the session cookies. They are cross-origin in development, so the
 * browser only stores or sends the cookies when the request opts in. They are public (no session is needed to
 * make them, a rejected login must not trigger a refresh), so they get the cookie and CSRF settings but no renewal.
 */
const SESSION_ROUTES: readonly string[] = [
  '/auth/login',
  // Step two of two-step sign-in. This is the call that actually sets the session cookies, so without credentials the
  // browser would silently discard them: the app would think it was signed in while every API call went out unauthenticated.
  '/auth/login/verify',
  '/auth/refresh',
  '/auth/logout',
];

/** Sent on every credentialed call: a header a cross-site form cannot add, which the services require for cookie-authenticated writes. */
const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'XMLHttpRequest';

function parse(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function isProtected(rawUrl: string): boolean {
  const url = parse(rawUrl);
  return (
    url !== null &&
    protectedApis().some(
      (api) =>
        api.origin === url.origin && (!api.pathPrefixes || api.pathPrefixes.some((p) => url.pathname.startsWith(p))),
    )
  );
}

function isSessionRoute(rawUrl: string): boolean {
  const url = parse(rawUrl);
  const authOrigin = new URL(AUTH_API_BASE_URL, window.location.origin).origin;
  return url !== null && url.origin === authOrigin && SESSION_ROUTES.includes(url.pathname);
}

/** Refresh a little early so a request does not leave just as the access cookie expires. */
const EXPIRY_MARGIN_MS = 15_000;

/**
 * Makes API calls carry the session and keeps it alive. The session is two HttpOnly cookies, so there is no
 * token to attach: calls to the platform APIs are sent with credentials and the CSRF header.
 *  - an access cookie that is about to expire (or already has, e.g. after a reload) is renewed before the call;
 *  - a 401 triggers one renewal and one retry.
 * If the refresh cookie is refused the session ends and the user is sent home (see `TokenRefresher`).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const withSession = (request: HttpRequest<unknown>) =>
    request.clone({ withCredentials: true, setHeaders: { [CSRF_HEADER]: CSRF_VALUE } });

  if (isSessionRoute(req.url)) {
    return next(withSession(req));
  }
  const session = inject(SessionService);
  if (!session.isLoggedIn() || !isProtected(req.url)) {
    return next(req);
  }

  const injector = inject(Injector);
  const send = () => next(withSession(req));
  const refreshThenSend = (staleExpiresAt: number | null, original?: unknown) =>
    from(injector.get(TokenRefresher).refresh(staleExpiresAt)).pipe(
      switchMap((renewed) =>
        renewed ? send() : throwError(() => original ?? new HttpErrorResponse({ status: 401, url: req.url })),
      ),
    );

  const expiresAt = session.session()?.expiresAt ?? null;
  const expiring = expiresAt !== null && expiresAt - Date.now() < EXPIRY_MARGIN_MS;
  const first = expiring ? refreshThenSend(expiresAt) : send();

  return first.pipe(
    catchError((error: unknown) =>
      error instanceof HttpErrorResponse && error.status === 401 && !expiring
        ? refreshThenSend(expiresAt, error)
        : throwError(() => error),
    ),
  );
};
