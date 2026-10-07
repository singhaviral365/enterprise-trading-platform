import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

/** Shared helpers for specs that sit on top of the portfolio store. Test-only: excluded from the app build. */

export const PORTFOLIO_URL = '/api/v1/portfolio/1001';
export const PORTFOLIO_POSITIONS_URL = `${PORTFOLIO_URL}/positions`;
export const PORTFOLIO_PNL_URL = `${PORTFOLIO_URL}/pnl`;
export const PORTFOLIO_REALISED_URL = `${PORTFOLIO_URL}/realised`;
export const PORTFOLIO_PERFORMANCE_URL = `${PORTFOLIO_URL}/performance`;

/** A held position as the Trade API reports it (name and icon live here, not on the priced route). */
export const held = (symbol: string, quantity: number, averageCost: number, iconUrl: string | null = null) => ({
  accountId: 1001,
  symbol,
  instrumentName: `${symbol} Inc.`,
  iconUrl,
  quantity,
  averageCost,
});

export function summaryBody(over: Record<string, unknown> = {}) {
  return {
    accountId: 1001,
    baseCurrency: 'USD',
    cashBalance: 1000,
    marketValue: 4059.45,
    costBasis: 3984,
    unrealisedPnl: 75.45,
    unrealisedPnlPercent: 1.89,
    realisedPnl: 100,
    totalValue: 5059.45,
    positionCount: 2,
    partial: false,
    dayPnl: 34.45,
    dayPnlPercent: 0.85,
    asOf: '2026-10-07T11:59:30Z',
    ...over,
  };
}

export function pricedPosition(symbol: string, over: Record<string, unknown> = {}) {
  return {
    accountId: 1001,
    symbol,
    quantity: 10,
    averageCost: 228.4,
    costBasis: 2284,
    lastPrice: 232.71,
    previousClose: 230,
    marketValue: 2327.1,
    unrealisedPnl: 43.1,
    unrealisedPnlPercent: 1.89,
    dayPnl: 27.1,
    dayPnlPercent: 1.18,
    currency: 'USD',
    priceAsOf: '2026-10-07T11:59:30Z',
    stale: false,
    ...over,
  };
}

/** A holding that could not be priced: the price figures are null and it is marked stale. */
export function unpricedPosition(symbol: string, over: Record<string, unknown> = {}) {
  return pricedPosition(symbol, {
    lastPrice: null,
    previousClose: null,
    marketValue: null,
    unrealisedPnl: null,
    unrealisedPnlPercent: null,
    dayPnl: null,
    dayPnlPercent: null,
    priceAsOf: null,
    stale: true,
    ...over,
  });
}

export function pnlBody(over: Record<string, unknown> = {}) {
  return {
    accountId: 1001,
    baseCurrency: 'USD',
    from: null,
    to: null,
    realisedPnl: 100,
    unrealisedPnl: 75.45,
    totalPnl: 175.45,
    dayPnl: 34.45,
    bySymbol: [
      { symbol: 'AAPL', realisedPnl: 100, unrealisedPnl: 43.1, totalPnl: 143.1 },
      { symbol: 'GOOGL', realisedPnl: 0, unrealisedPnl: 32.35, totalPnl: 32.35 },
    ],
    asOf: '2026-10-07T11:59:30Z',
    ...over,
  };
}

/** One closed day of the history. */
export function navPoint(date: string, nav: number, value: number, over: Record<string, unknown> = {}) {
  return {
    date,
    nav,
    value,
    netFlow: 0,
    dayPnl: 0,
    unrealisedPnl: 0,
    realisedPnlCumulative: 0,
    estimated: false,
    ...over,
  };
}

/** A short history: three closed days, 1000 -> 1100. */
export function performanceBody(over: Record<string, unknown> = {}) {
  return {
    accountId: 1001,
    baseCurrency: 'USD',
    estimated: false,
    availableFrom: '2026-09-01',
    summary: { returnPct: 10, pnl: 1000, annualisedPct: null, maxDrawdownPct: 0, bestDayPct: 5, worstDayPct: 4.7 },
    points: [
      navPoint('2026-09-01', 1000, 10000, { netFlow: 10000 }),
      navPoint('2026-09-02', 1050, 10500, { dayPnl: 500 }),
      navPoint('2026-09-03', 1100, 11000, { dayPnl: 500 }),
    ],
    ...over,
  };
}

export interface PortfolioAnswers {
  readonly summary?: object;
  readonly positions?: readonly object[];
  readonly pnl?: object;
  /** The history. Pass `'skip'` to leave that request for the test to answer itself. */
  readonly performance?: object | 'skip';
}

/** Answers the history read that every load makes (the performance section loads on its own). */
export async function answerPerformance(http: HttpTestingController, body: object = performanceBody()): Promise<TestRequest> {
  const request = await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === PORTFOLIO_PERFORMANCE_URL));
  request.flush(body);
  return request;
}

/** Waits for the portfolio reads that follow a load, answers them, and returns the pnl request for its parameters. */
export async function answerPortfolio(http: HttpTestingController, answers: PortfolioAnswers = {}): Promise<TestRequest> {
  (await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === PORTFOLIO_URL))).flush(
    answers.summary ?? summaryBody(),
  );
  (await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === PORTFOLIO_POSITIONS_URL))).flush(
    answers.positions ?? [pricedPosition('AAPL'), pricedPosition('GOOGL', { quantity: 5, averageCost: 340, costBasis: 1700, lastPrice: 346.47, marketValue: 1732.35, unrealisedPnl: 32.35, unrealisedPnlPercent: 1.9, dayPnl: 7.35, dayPnlPercent: 0.43 })],
  );
  const pnl = await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === PORTFOLIO_PNL_URL));
  pnl.flush(answers.pnl ?? pnlBody());
  if (answers.performance !== 'skip') {
    await answerPerformance(http, answers.performance);
  }
  return pnl;
}

export function realisedBody(over: Record<string, unknown> = {}) {
  return {
    accountId: 1001,
    baseCurrency: 'USD',
    from: null,
    to: null,
    realisedPnl: 100,
    asOf: '2026-10-07T11:59:30Z',
    ...over,
  };
}

/**
 * Answers all three reads with the contract's "pricing unavailable for every symbol", then the realised-only read that
 * follows (it needs no price): with a body, or with 'fails' to show that even that is allowed to fail.
 */
export async function answerPortfolioUnavailable(
  http: HttpTestingController,
  realised: object | 'fails' = realisedBody(),
  performance: object | 'skip' = performanceBody(),
): Promise<void> {
  const failure = { errorCode: 'MKT-503', message: 'Pricing unavailable' };
  for (const url of [PORTFOLIO_URL, PORTFOLIO_POSITIONS_URL, PORTFOLIO_PNL_URL]) {
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === url))).flush(failure, {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
  const request = await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === PORTFOLIO_REALISED_URL));
  if (realised === 'fails') {
    request.flush({ errorCode: 'SRV-500', message: 'x' }, { status: 500, statusText: 'x' });
  } else {
    request.flush(realised);
  }
  if (performance !== 'skip') {
    await answerPerformance(http, performance);
  }
}
