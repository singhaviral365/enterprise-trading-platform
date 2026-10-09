import { HttpTestingController } from '@angular/common/http/testing';

/** Shared helpers for specs that sit on top of the account store. Test-only: excluded from the app build. */

export const TEST_TOKENS = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

export const ACCOUNT_BASE = '/api/v1/accounts/1001';
export const LINK_URL = '/api/v1/accounts/link';
export const QUOTES_URL = '/api/v1/market/quotes';

export interface AccountScenario {
  readonly status?: string;
  readonly cashBalance?: number;
  readonly positions?: readonly unknown[];
  readonly orders?: readonly unknown[];
}

export function orderEntry(orderId: string, symbol: string, status: string, createdOn: string, side = 'BUY') {
  return {
    orderId,
    accountId: 1001,
    symbol,
    instrumentName: `${symbol} Inc.`,
    iconUrl: null,
    side,
    orderPricingType: 'MARKET',
    quantity: 5,
    price: null,
    executedPrice: status === 'FILLED' ? 100 : null,
    status,
    createdOn,
  };
}

/** Answers the store's link lookup and the four account reads that follow it. */
export async function answerLinkedAccount(http: HttpTestingController, scenario: AccountScenario = {}): Promise<void> {
  (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({
    linked: true,
    message: 'Linked account found',
    accountNumber: 'ACC000001001',
  });
  const cash = scenario.cashBalance ?? 25000;
  (await vi.waitFor(() => http.expectOne(ACCOUNT_BASE))).flush({
    id: 1001,
    accountId: 'ACC000001001',
    holderName: 'USER-1000',
    cashBalance: cash,
    status: scenario.status ?? 'ACTIVE',
    version: 1,
    lastUpdated: '2026-10-01T00:00:00Z',
  });
  http.expectOne(`${ACCOUNT_BASE}/balance`).flush({ accountId: 1001, cashBalance: cash, currency: 'USD', asOf: '2026-10-01T00:00:00Z' });
  http.expectOne(`${ACCOUNT_BASE}/positions`).flush(scenario.positions ?? []);
  http.expectOne(`${ACCOUNT_BASE}/orders`).flush(scenario.orders ?? []);
}

/** Answers the link lookup with "no account yet". */
export async function answerUnlinkedAccount(http: HttpTestingController): Promise<void> {
  (await vi.waitFor(() => http.expectOne(LINK_URL))).flush({ linked: false, message: 'No linked account yet' });
}

export const quote = (symbol: string, price: number | null, details: Record<string, unknown> | null = {}) => ({
  symbol,
  name: `${symbol} Inc.`,
  assetClass: 'EQUITY',
  price,
  details,
});

export const SAMPLE_QUOTES = [
  quote('AAPL', 200, { currency: 'USD', change: 1.5, changePercent: 0.75, previousClose: 198.5, asOf: '2026-10-01T10:00:00Z' }),
  quote('MSFT', 400, { currency: 'USD', change: -2, changePercent: -0.5, previousClose: 402 }),
  quote('TSLA', 250, { currency: 'USD', change: 0, changePercent: 0, previousClose: 250 }),
  quote('NVDA', null, null),
  quote('AMZN', 180, { currency: 'USD' }),
  quote('GOOG', 150, { currency: 'USD' }),
  quote('META', 500, { currency: 'USD' }),
];
