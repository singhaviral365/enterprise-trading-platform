import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AUTH_API_BASE_URL, TRADE_API_BASE_URL } from '../../api/api.config';
import { ACCESS_TOKEN_PROVIDER } from '../auth/access-token.provider';

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

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(ACCESS_TOKEN_PROVIDER).getAccessToken();
  if (!token || !isProtected(req.url)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
