import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { provideApi as provideAuthApi } from './generated/auth';
import { provideApi as provideTradeApi } from './generated/trade';

/** Base URLs match the servers declared in documentation/contracts. */
export const AUTH_API_BASE_URL = 'http://localhost:3000';
export const TRADE_API_BASE_URL = 'http://localhost:8080';

/** Points each generated client at its service. Add to the application providers. */
export function provideApiClients(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuthApi(AUTH_API_BASE_URL),
    provideTradeApi(TRADE_API_BASE_URL),
  ]);
}
