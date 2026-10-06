import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { provideApi as provideAuthApi } from './generated/auth';
import { provideApi as providePreferencesApi } from './generated/preferences';
import { provideApi as provideTradeApi } from './generated/trade';
import { provideApi as provideWatchlistApi } from './generated/watchlist';

/** Auth service (NestJS). It enables CORS for the dev server, so the browser calls it directly. */
export const AUTH_API_BASE_URL = 'http://localhost:3000';

/**
 * Trade API (order-service). Empty on purpose: calls stay same-origin (`/api/v1/...`) and `ng serve`
 * proxies them to http://localhost:8081 (see proxy.conf.json), because the order-service has no CORS
 * configuration. Behind a real gateway, set this to the gateway's origin. The watchlist module is part of
 * the same service, so it shares this base URL (as does the preferences module).
 */
export const TRADE_API_BASE_URL = '';

/** Points each generated client at its service. Add to the application providers. */
export function provideApiClients(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuthApi(AUTH_API_BASE_URL),
    provideTradeApi(TRADE_API_BASE_URL),
    provideWatchlistApi(TRADE_API_BASE_URL),
    providePreferencesApi(TRADE_API_BASE_URL),
  ]);
}
