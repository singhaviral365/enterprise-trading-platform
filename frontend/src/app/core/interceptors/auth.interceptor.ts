import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AUTH_API_BASE_URL, TRADE_API_BASE_URL } from '../../api/api.config';
import { ACCESS_TOKEN_PROVIDER } from '../auth/access-token.provider';
import { TokenRefresher } from '../auth/token-refresher';
import { SessionService } from '../session.service';

export interface ProtectedApi {
  origin: string;
  /** When set, only paths starting with one of these prefixes get the token. */
  pathPrefixes?: readonly string[];
}

/**
 * Allow-list: the token is sent only to these platform APIs, nothing else. Built from the same base
 * URLs the generated clients use, so the two cannot drift apart. A relative base URL (the Trade API
 * behind the dev proxy) resolves to the page's own origin.
 */
export function protectedApis(): readonly ProtectedApi[] {
  return [
    // Trade REST API, and the market endpoint that lives under the same prefix
    { origin: new URL(TRADE_API_BASE_URL, window.location.origin).origin, pathPrefixes: ['/api/v1/'] },
    // Auth API: only the protected route; login/register/refresh take no header
    { origin: new URL(AUTH_API_BASE_URL, window.location.origin).origin, pathPrefixes: ['/auth/me'] },
  ];
}

function isProtected(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    return false;
  }
  return protectedApis().some(
    (api) =>
      api.origin === url.origin &&
      (!api.pathPrefixes || api.pathPrefixes.some((p) => url.pathname.startsWith(p))),
  );
}

/** Refresh a little early so a request does not leave with a token that expires in flight. */
const EXPIRY_MARGIN_MS = 15_000;

/**
 * Adds the bearer token to platform API calls and keeps the session alive:
 *  - a token that is about to expire (or already has, e.g. after a reload) is refreshed before the call;
 *  - a 401 triggers one refresh and one retry with the new token.
 * If the refresh token is refused the session ends and the user is sent home (see `TokenRefresher`).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(ACCESS_TOKEN_PROVIDER).getAccessToken();
  if (!token || !isProtected(req.url)) {
    return next(req);
  }
  const injector = inject(Injector);
  const withToken = (value: string) => next(req.clone({ setHeaders: { Authorization: `Bearer ${value}` } }));
  const refreshThenSend = (stale: string, original?: unknown) =>
    from(injector.get(TokenRefresher).refresh(stale)).pipe(
      switchMap((fresh) =>
        fresh ? withToken(fresh) : throwError(() => original ?? new HttpErrorResponse({ status: 401, url: req.url })),
      ),
    );

  const expiresAt = injector.get(SessionService).session()?.expiresAt;
  const expiring = expiresAt !== undefined && expiresAt - Date.now() < EXPIRY_MARGIN_MS;
  const first = expiring ? refreshThenSend(token) : withToken(token);

  return first.pipe(
    catchError((error: unknown) =>
      error instanceof HttpErrorResponse && error.status === 401 && !expiring
        ? refreshThenSend(token, error)
        : throwError(() => error),
    ),
  );
};
