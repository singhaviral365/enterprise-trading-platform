import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ACCESS_TOKEN_PROVIDER } from '../auth/access-token.provider';

export interface ProtectedApi {
  origin: string;
  /** When set, only paths starting with one of these prefixes get the token. */
  pathPrefixes?: readonly string[];
}

/** Allow-list: the token is sent only to these platform APIs, nothing else. */
export const PROTECTED_APIS: readonly ProtectedApi[] = [
  // Trade REST API
  { origin: 'http://localhost:8080', pathPrefixes: ['/api/v1/'] },
  // Auth API: only the protected route; login/register/refresh take no header
  { origin: 'http://localhost:3000', pathPrefixes: ['/auth/me'] },
];

function isProtected(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    return false;
  }
  return PROTECTED_APIS.some(
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
