import { OrderHistoryEntry } from '../api/generated/trade';
import { toCandles, toTradeMarkers } from './price-candles';

const HISTORY = {
  symbol: 'AAPL',
  currency: 'USD',
  interval: '1d',
  candles: [
    { date: '2026-09-01', open: 10, high: 12, low: 9, close: 11, volume: 100, synthetic: false },
    { date: '2026-09-02', open: null, high: null, low: null, close: 11, volume: null, synthetic: true },
    { date: '2026-09-03', open: 11, high: 13, low: 10, close: 12, volume: null, synthetic: false },
  ],
};

function order(over: Record<string, unknown>): OrderHistoryEntry {
  return {
    orderId: '1',
    accountId: 1,
    symbol: 'AAPL',
    instrumentName: 'Apple',
    side: 'BUY',
    orderPricingType: 'MARKET',
    quantity: 5,
    executedPrice: 11,
    status: 'FILLED',
    createdOn: '2026-09-03T15:30:00Z',
    ...over,
  } as unknown as OrderHistoryEntry;
}

describe('toCandles', () => {
  it('keeps the days that have all four prices, oldest first, at midnight UTC', () => {
    const candles = toCandles(HISTORY);

    expect(candles.map((c) => c.time)).toEqual([Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 3)]);
    expect(candles[0]).toEqual({ time: Date.UTC(2026, 8, 1), open: 10, high: 12, low: 9, close: 11, volume: 100 });
    expect(candles[1].volume).toBeNull();
  });
});

describe('toTradeMarkers', () => {
  const same = (amount: number) => amount;

  it('marks filled orders of the symbol on the day they were made, at their fill price', () => {
    const markers = toTradeMarkers(
      [order({}), order({ orderId: '2', side: 'SELL', quantity: 2, executedPrice: 12.5, createdOn: '2026-09-04T09:00:00Z' })],
      'AAPL',
      Date.UTC(2026, 8, 1),
      same,
    );

    expect(markers).toEqual([
      { time: Date.UTC(2026, 8, 3), price: 11, side: 'BUY', quantity: 5 },
      { time: Date.UTC(2026, 8, 4), price: 12.5, side: 'SELL', quantity: 2 },
    ]);
  });

  it('leaves out other symbols, unfilled orders and orders from before the chart starts', () => {
    const markers = toTradeMarkers(
      [order({ symbol: 'MSFT' }), order({ status: 'REJECTED' }), order({ executedPrice: null }), order({ createdOn: '2025-01-01T00:00:00Z' })],
      'AAPL',
      Date.UTC(2026, 8, 1),
      same,
    );

    expect(markers).toEqual([]);
  });

  it('converts the price into the chart currency, and leaves out an order it cannot convert', () => {
    const half = (amount: number) => amount / 2;
    expect(toTradeMarkers([order({})], 'AAPL', 0, half)[0].price).toBe(5.5);
    expect(toTradeMarkers([order({})], 'AAPL', 0, () => null)).toEqual([]);
  });
});
