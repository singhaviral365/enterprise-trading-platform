import { InjectionToken } from '@angular/core';

export interface AccessTokenProvider {
  getAccessToken(): string | null;
  isAuthenticated(): boolean;
}

/**
 * Source of the current access token. The login flow will supply the real
 * implementation; until then no token is available.
 */
export const ACCESS_TOKEN_PROVIDER = new InjectionToken<AccessTokenProvider>(
  'ACCESS_TOKEN_PROVIDER',
  {
    providedIn: 'root',
    factory: () => ({ getAccessToken: () => null, isAuthenticated: () => false }),
  },
);
