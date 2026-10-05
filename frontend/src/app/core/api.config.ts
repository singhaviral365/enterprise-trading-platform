import { InjectionToken } from '@angular/core';

/**
 * Market data served by the trade-executor (port 8082). There is no contract for it yet, so
 * `MarketService` calls it by hand; every other API goes through the generated clients in `api/`.
 * In development `ng serve` proxies `/api/v1/market` there (see proxy.conf.json); it sits under
 * `/api/v1` so the auth interceptor attaches the access token.
 */
export const MARKET_API_URL = new InjectionToken<string>('MARKET_API_URL', {
  factory: () => '/api/v1/market',
});
