import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../api/api.config';
import {
  PORTFOLIO_PERFORMANCE_URL,
  PORTFOLIO_PNL_URL,
  PORTFOLIO_POSITIONS_URL,
  PORTFOLIO_URL,
  answerPerformance,
  answerPortfolio,
  answerPortfolioUnavailable,
  performanceBody,
  pnlBody,
  pricedPosition,
  realisedBody,
  summaryBody,
} from '../testing/portfolio-http';
import { TEST_TOKENS, answerLinkedAccount, answerUnlinkedAccount } from '../testing/trade-http';
import {
  HISTORY_MAX_POLLS,
  HISTORY_POLL_MS,
  PORTFOLIO_REFRESH_MS,
  PortfolioStore,
  isPricingUnavailable,
} from './portfolio.store';
import { SessionService } from './session.service';
import { HttpErrorResponse } from '@angular/common/http';

describe('PortfolioStore', () => {
  let store: PortfolioStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    });
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PortfolioStore);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('reads the summary, the priced positions and the profit and loss by symbol for the linked account', async () => {
    await answerLinkedAccount(http);
    const pnl = await answerPortfolio(http);

    await vi.waitFor(() => expect(store.snapshot()).not.toBeNull());
    expect(pnl.request.params.get('bySymbol')).toBe('true');
    expect(store.snapshot()?.summary.totalValue).toBe(5059.45);
    expect(store.snapshot()?.positions.map((p) => p.symbol)).toEqual(['AAPL', 'GOOGL']);
    expect(store.pnlSnapshot()?.bySymbol?.length).toBe(2);
    expect(store.history()?.points.length).toBe(3);
    expect(store.unavailable()).toBe(false);
    expect(store.errorMessage()).toBe('');
  });

  it('does nothing for an account that is not open yet, so there are no requests', async () => {
    await answerUnlinkedAccount(http);
    await TestBed.inject(PortfolioStore).data.reload();

    http.expectNone((r) => r.url.startsWith('/api/v1/portfolio'));
    expect(store.snapshot()).toBeNull();
    expect(store.unavailable()).toBe(false);
  });

  it('treats pricing unavailable for every symbol (MKT-503) as a state, not an error', async () => {
    await answerLinkedAccount(http);
    await answerPortfolioUnavailable(http);

    await vi.waitFor(() => expect(store.unavailable()).toBe(true));
    await vi.waitFor(() => expect(store.pnlUnavailable()).toBe(true));
    expect(store.snapshot()).toBeNull();
    expect(store.errorMessage()).toBe('');
    expect(store.pnlErrorMessage()).toBe('');
  });

  it('still has what was realised when pricing is down, because that needs no price', async () => {
    await answerLinkedAccount(http);
    await answerPortfolioUnavailable(http, realisedBody({ realisedPnl: 250.5 }));

    await vi.waitFor(() => expect(store.unavailableRealised()?.realisedPnl).toBe(250.5));
    expect(store.unavailable()).toBe(true);
  });

  it('is still unavailable, not an error, if the realised read fails as well', async () => {
    await answerLinkedAccount(http);
    await answerPortfolioUnavailable(http, 'fails');

    await vi.waitFor(() => expect(store.unavailable()).toBe(true));
    expect(store.unavailableRealised()).toBeNull();
    expect(store.errorMessage()).toBe('');
  });

  it('reports any other failure as an error with a sentence', async () => {
    await answerLinkedAccount(http);
    for (const url of [PORTFOLIO_URL, PORTFOLIO_POSITIONS_URL, PORTFOLIO_PNL_URL, PORTFOLIO_PERFORMANCE_URL]) {
      (await vi.waitFor(() => http.expectOne((r) => r.url === url))).flush({ errorCode: 'SRV-500', message: 'x' }, { status: 500, statusText: 'x' });
    }

    await vi.waitFor(() => expect(store.errorMessage()).not.toBe(''));
    expect(store.pnlErrorMessage()).not.toBe('');
    expect(store.historyErrorMessage()).not.toBe('');
    expect(store.unavailable()).toBe(false);
  });

  it('bounds the realised figure by the chosen dates and reloads only the profit and loss, nothing else', async () => {
    await answerLinkedAccount(http);
    await answerPortfolio(http);
    await vi.waitFor(() => expect(store.snapshot()).not.toBeNull());

    store.setRealisedRange('2026-09-01', '2026-10-19');
    const pnl = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL));
    pnl.flush(pnlBody());

    expect(pnl.request.params.get('from')).toBe('2026-09-01');
    expect(pnl.request.params.get('to')).toBe('2026-10-19');
    http.expectNone((r) => r.url !== PORTFOLIO_PNL_URL && r.url.startsWith('/api/v1/portfolio'));
    expect(store.data.isLoading()).toBe(false);
    expect(store.performance.isLoading()).toBe(false);
  });

  it('does not leave the old breakdown standing under a new filter, while the summary stays', async () => {
    await answerLinkedAccount(http);
    await answerPortfolio(http);
    await vi.waitFor(() => expect(store.pnlSnapshot()).not.toBeNull());

    store.setRealisedRange('2026-09-01', '');
    await vi.waitFor(() => expect(store.pnl.isLoading()).toBe(true));

    expect(store.pnlSnapshot()).toBeNull();
    expect(store.snapshot()).not.toBeNull();
    (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL))).flush(pnlBody());
  });

  it('asks for a benchmark and reloads only the history', async () => {
    await answerLinkedAccount(http);
    await answerPortfolio(http);
    await vi.waitFor(() => expect(store.history()).not.toBeNull());

    store.setBenchmark('SPY');
    const request = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL));
    request.flush(performanceBody({ benchmark: { symbol: 'SPY', points: [{ date: '2026-09-01', nav: 1000 }] } }));

    expect(request.request.params.get('benchmark')).toBe('SPY');
    http.expectNone((r) => r.url !== PORTFOLIO_PERFORMANCE_URL && r.url.startsWith('/api/v1/portfolio'));
    await vi.waitFor(() => expect(store.history()?.benchmark?.symbol).toBe('SPY'));
  });

  describe('the history being built', () => {
    const building = { status: 'building' };

    afterEach(() => vi.useRealTimers());

    it('says it is building (HTTP 202) and asks again shortly until the history arrives', async () => {
      await answerLinkedAccount(http);
      await answerPortfolio(http, { performance: building });
      await vi.waitFor(() => expect(store.historyBuilding()).toBe(true));
      expect(store.history()).toBeNull();

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      TestBed.tick();
      vi.advanceTimersByTime(HISTORY_POLL_MS);
      vi.useRealTimers();
      await answerPerformance(http);

      await vi.waitFor(() => expect(store.history()?.points.length).toBe(3));
      expect(store.historyBuilding()).toBe(false);
    });

    it('gives up after a bounded number of tries', () => {
      expect(HISTORY_MAX_POLLS).toBeGreaterThan(0);
      expect(HISTORY_MAX_POLLS * HISTORY_POLL_MS).toBeLessThanOrEqual(120_000);
    });
  });

  it('refreshes by itself only while the page asks it to', async () => {
    await answerLinkedAccount(http);
    await answerPortfolio(http);
    await vi.waitFor(() => expect(store.snapshot()).not.toBeNull());

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const stop = store.autoRefresh();
    vi.advanceTimersByTime(PORTFOLIO_REFRESH_MS);
    vi.useRealTimers();
    await answerPortfolio(http, { summary: summaryBody({ totalValue: 6000 }), positions: [pricedPosition('AAPL')] });
    await vi.waitFor(() => expect(store.snapshot()?.summary.totalValue).toBe(6000));

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stop();
    vi.advanceTimersByTime(PORTFOLIO_REFRESH_MS * 3);
    http.expectNone((r) => r.url.startsWith('/api/v1/portfolio'));
  });

  it('recognises the contracts pricing-unavailable answer and nothing else', () => {
    const unavailable = new HttpErrorResponse({ status: 503, error: { errorCode: 'MKT-503', message: 'x' } });
    const otherCode = new HttpErrorResponse({ status: 503, error: { errorCode: 'FX-503', message: 'x' } });
    const otherStatus = new HttpErrorResponse({ status: 500, error: { errorCode: 'MKT-503', message: 'x' } });

    expect(isPricingUnavailable(unavailable)).toBe(true);
    expect(isPricingUnavailable(otherCode)).toBe(false);
    expect(isPricingUnavailable(otherStatus)).toBe(false);
    expect(isPricingUnavailable(new Error('boom'))).toBe(false);
    expect(PORTFOLIO_PNL_URL).toContain('/pnl');
  });
});
