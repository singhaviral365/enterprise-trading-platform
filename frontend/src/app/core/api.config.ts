import { InjectionToken } from '@angular/core';

/** Base URL of the Auth service (see backend/auth-service, default port 3000). */
export const AUTH_API_URL = new InjectionToken<string>('AUTH_API_URL', {
  factory: () => 'http://localhost:3000',
});

/**
 * Base URL of the Trade API (backend/trade-api). It has no CORS configuration, so in development
 * `ng serve` proxies `/api` to http://localhost:8081 (see proxy.conf.json) and calls stay same-origin.
 */
export const TRADE_API_URL = new InjectionToken<string>('TRADE_API_URL', {
  factory: () => '/api/v1',
});

/**
 * Market data served by the trade-executor (port 8082). In development `ng serve` proxies
 * `/api/v1/market` there (see proxy.conf.json); it sits under `/api/v1` so the auth interceptor
 * attaches the access token.
 */
export const MARKET_API_URL = new InjectionToken<string>('MARKET_API_URL', {
  factory: () => '/api/v1/market',
});
