import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { MarketService } from '../../core/market.service';
import { provideApiClients } from '../../api/api.config';
import { PriceRanges, rangeOf } from './price-ranges';

const history = (currency: string | null, lows: number[], highs: number[]) => ({
  symbol: 'X',
  currency,
  interval: '1d',
  candles: lows.map((low, i) => ({
    date: `2026-09-0${i + 1}`,
    open: low,
    high: highs[i],
    low,
    close: low,
    volume: 1,
    synthetic: false,
  })),
});

describe('rangeOf', () => {
  it('is the lowest low and the highest high, and uses the close for a day without a high or low', () => {
    const range = rangeOf({
      symbol: 'X',
      currency: 'USD',
      interval: '1d',
      candles: [
        { date: '2026-09-01', open: 10, high: 12, low: 9, close: 11, volume: 1, synthetic: false },
        { date: '2026-09-02', open: null, high: null, low: null, close: 14, volume: null, synthetic: true },
      ],
    });

    expect(range).toEqual({ low: 9, high: 14, currency: 'USD' });
  });

  it('is null without a candle', () => {
    expect(rangeOf({ symbol: 'X', currency: null, interval: '1d', candles: [] })).toBeNull();
  });
});

describe('PriceRanges', () => {
  let ranges: PriceRanges;
  let http: HttpTestingController;
  let accountCurrency: ReturnType<typeof signal<string>>;

  beforeEach(() => {
    accountCurrency = signal('USD');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        {
          provide: AccountOverviewStore,
          useValue: { linked: () => ({ overview: { balance: { currency: accountCurrency() } } }) },
        },
      ],
    });
    ranges = TestBed.inject(PriceRanges);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const answer = async (symbol: string, body: object | null) => {
    const request = await vi.waitFor(() => http.expectOne((r) => r.url.endsWith(`/market/candles/${symbol}`)));
    if (body) {
      request.flush(body);
    } else {
      request.flush('down', { status: 503, statusText: 'x' });
    }
  };

  it('reads each symbol once, however often it is asked for', async () => {
    ranges.ensure(['AAPL', 'MSFT']);
    ranges.ensure(['AAPL']);

    await answer('AAPL', history('USD', [100, 90], [120, 130]));
    await answer('MSFT', history('USD', [10], [20]));
    http.expectNone((r) => r.url.includes('/market/candles/'));

    await vi.waitFor(() => expect(ranges.accountRange('MSFT')).toEqual({ low: 10, high: 20 }));
    expect(ranges.accountRange('AAPL')).toEqual({ low: 90, high: 130 });
  });

  it('has no range while loading, for a symbol never asked for, or when the read failed', async () => {
    expect(ranges.accountRange('AAPL')).toBeNull();
    ranges.ensure(['AAPL']);
    expect(ranges.accountRange('AAPL')).toBeNull();

    await answer('AAPL', null);
    await vi.waitFor(() => expect(ranges.accountRange('AAPL')).toBeNull());
    expect(ranges.accountRange('NEVER')).toBeNull();
  });

  it('converts a range quoted in another currency into the account currency with the board rates', async () => {
    accountCurrency.set('USD');
    const market = TestBed.inject(MarketService);
    ranges.ensure(['INFY.NS']);
    await answer('INFY.NS', history('INR', [1000], [2000]));
    // The range is in INR and the account in USD, so the board is read for its rates.
    const board = await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/market/quotes')));
    board.flush({ quotes: [], asOf: '2026-10-01T10:00:00Z', stale: false, baseCurrency: 'USD', fxRates: { USD: 1, INR: 100 } });
    await vi.waitFor(() => expect(market.fxRates()).not.toBeNull());

    expect(ranges.accountRange('INFY.NS')).toEqual({ low: 10, high: 20 });
  });

  it('leaves out a foreign range it has no rate for', async () => {
    ranges.ensure(['INFY.NS']);
    await answer('INFY.NS', history('INR', [1000], [2000]));
    const board = await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/market/quotes')));
    board.flush('down', { status: 503, statusText: 'x' });

    await vi.waitFor(() => expect(ranges.accountRange('INFY.NS')).toBeNull());
  });
});
