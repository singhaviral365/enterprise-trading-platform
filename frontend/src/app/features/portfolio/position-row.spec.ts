import { PricedPosition } from '../../api/generated/portfolio';
import { PositionResponse } from '../../api/generated/trade';
import { toPositionRow, toPricedRows, toUnpricedRows } from './position-row';

const held = (symbol: string, quantity: number, averageCost: number): PositionResponse => ({
  accountId: 1001,
  symbol,
  instrumentName: `${symbol} Inc.`,
  iconUrl: `/assets/icons/${symbol}.svg`,
  quantity,
  averageCost,
});

const priced = (symbol: string, over: Partial<PricedPosition> = {}): PricedPosition => ({
  accountId: 1001,
  symbol,
  quantity: 10,
  averageCost: 100,
  costBasis: 1000,
  lastPrice: 110,
  previousClose: 108,
  marketValue: 1100,
  unrealisedPnl: 100,
  unrealisedPnlPercent: 10,
  dayPnl: 20,
  dayPnlPercent: 1.85,
  currency: 'USD',
  priceAsOf: '2026-10-07T11:59:30Z',
  stale: false,
  ...over,
});

describe('toPositionRow', () => {
  it('has no pricing unless it is given some', () => {
    const row = toPositionRow(held('AAPL', 10, 100));

    expect(row.pricing).toBeNull();
    expect(row.costBasis).toBe(1000);
  });
});

describe('toPricedRows', () => {
  it('takes the name and logo from the positions the app already holds, matched by symbol', () => {
    const [row] = toPricedRows([priced('aapl')], [held('AAPL', 10, 100)]);

    expect(row.name).toBe('AAPL Inc.');
    expect(row.iconUrl).toBe('/assets/icons/AAPL.svg');
  });

  it('copes with a priced holding the app does not know the name of', () => {
    const [row] = toPricedRows([priced('ZZZ')], []);

    expect(row.name).toBe('');
    expect(row.iconUrl).toBeNull();
  });

  it('turns an omitted price into nulls and marks the holding unavailable', () => {
    const [row] = toPricedRows(
      [priced('INFY.NS', { lastPrice: null, marketValue: null, unrealisedPnl: null, dayPnl: null, priceAsOf: null, stale: true })],
      [],
    );

    expect(row.pricing?.status).toBe('unavailable');
    expect(row.pricing?.lastPrice).toBeNull();
    expect(row.pricing?.marketValue).toBeNull();
    expect(row.costBasis).toBe(1000);
  });

  it('treats a missing price as unavailable even if the server forgot to say it was stale', () => {
    const [row] = toPricedRows([priced('X', { lastPrice: undefined, stale: false })], []);

    expect(row.pricing?.status).toBe('unavailable');
  });

  it('marks a stale price delayed and a fresh one live', () => {
    const rows = toPricedRows([priced('OLD', { stale: true }), priced('NEW')], []);

    expect(rows.find((row) => row.symbol === 'OLD')?.pricing?.status).toBe('delayed');
    const fresh = rows.find((row) => row.symbol === 'NEW')!;
    expect(fresh.pricing?.status).toBe('live');
    expect(fresh.pricing?.unrealisedPercent).toBe(10);
    expect(fresh.pricing?.dayPnl).toBe(20);
  });

  it('sorts by symbol', () => {
    const rows = toPricedRows([priced('MSFT'), priced('AAPL'), priced('GOOGL')], []);

    expect(rows.map((row) => row.symbol)).toEqual(['AAPL', 'GOOGL', 'MSFT']);
  });
});

describe('toUnpricedRows', () => {
  it('lists what is held, unavailable, with the cost it was bought for', () => {
    const rows = toUnpricedRows([held('MSFT', 3, 400), held('AAPL', 10, 100)]);

    expect(rows.map((row) => row.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(rows[1].costBasis).toBe(1200);
    expect(rows.every((row) => row.pricing?.status === 'unavailable' && row.pricing.lastPrice === null)).toBe(true);
  });

  it('leaves out a position that has been sold down to nothing', () => {
    expect(toUnpricedRows([held('AAPL', 0, 100), held('MSFT', 1, 400)]).map((row) => row.symbol)).toEqual(['MSFT']);
  });
});
