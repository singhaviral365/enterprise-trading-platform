import {
  OrderHistoryEntry,
  OrderPricingType,
  OrderSide,
  OrderStatus,
} from '../api/generated/trade';
import { investedOverTime } from './invested-history';

let nextId = 1;
function order(overrides: Partial<OrderHistoryEntry>): OrderHistoryEntry {
  return {
    orderId: String(nextId++),
    accountId: 1001,
    symbol: 'AAPL',
    instrumentName: 'Apple Inc.',
    side: OrderSide.Buy,
    orderPricingType: OrderPricingType.Market,
    quantity: 10,
    price: null,
    executedPrice: 100,
    status: OrderStatus.Filled,
    createdOn: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

const values = (orders: OrderHistoryEntry[]) =>
  investedOverTime(orders).map((point) => point.invested);

describe('investedOverTime', () => {
  it('adds quantity x price on every buy, oldest first, whatever order the history arrives in', () => {
    const result = investedOverTime([
      order({ quantity: 5, executedPrice: 200, createdOn: '2026-09-10T10:00:00Z' }),
      order({ quantity: 10, executedPrice: 100, createdOn: '2026-09-01T10:00:00Z' }),
    ]);

    expect(result.map((p) => p.invested)).toEqual([1000, 2000]);
    expect(result[0].time).toBeLessThan(result[1].time);
  });

  it('removes a sell at the average cost, so selling does not change the average', () => {
    // 10 @ 100 and 10 @ 200: average 150, cost 3000. Selling 10 releases 1500.
    expect(
      values([
        order({ quantity: 10, executedPrice: 100, createdOn: '2026-09-01T10:00:00Z' }),
        order({ quantity: 10, executedPrice: 200, createdOn: '2026-09-02T10:00:00Z' }),
        order({
          side: OrderSide.Sell,
          quantity: 10,
          executedPrice: 999,
          createdOn: '2026-09-03T10:00:00Z',
        }),
      ]),
    ).toEqual([1000, 3000, 1500]);
  });

  it('goes to zero when everything is sold and starts again from the next buy', () => {
    expect(
      values([
        order({ createdOn: '2026-09-01T10:00:00Z' }),
        order({ side: OrderSide.Sell, createdOn: '2026-09-02T10:00:00Z' }),
        order({ executedPrice: 50, createdOn: '2026-09-03T10:00:00Z' }),
      ]),
    ).toEqual([1000, 0, 500]);
  });

  it('keeps each symbol on its own average', () => {
    expect(
      values([
        order({
          symbol: 'AAPL',
          quantity: 10,
          executedPrice: 100,
          createdOn: '2026-09-01T10:00:00Z',
        }),
        order({
          symbol: 'MSFT',
          quantity: 1,
          executedPrice: 400,
          createdOn: '2026-09-02T10:00:00Z',
        }),
        order({
          symbol: 'AAPL',
          side: OrderSide.Sell,
          quantity: 5,
          createdOn: '2026-09-03T10:00:00Z',
        }),
      ]),
    ).toEqual([1000, 1400, 900]);
  });

  it('ignores orders that never filled, and a sell of shares the history never bought', () => {
    expect(
      values([
        order({ status: OrderStatus.Rejected, executedPrice: null }),
        order({ status: OrderStatus.New, executedPrice: null }),
        order({ side: OrderSide.Sell, quantity: 5, createdOn: '2026-09-01T09:00:00Z' }),
        order({ createdOn: '2026-09-02T10:00:00Z' }),
      ]),
    ).toEqual([1000]);
  });

  it('falls back to the order price, and skips an order with no price at all', () => {
    expect(
      values([
        order({ executedPrice: null, price: 90 }),
        order({ executedPrice: null, price: null }),
      ]),
    ).toEqual([900]);
  });

  it('replays orders with the same timestamp in id order, so a buy comes before the sell that follows it', () => {
    const sameTime = '2026-09-01T10:00:00Z';
    expect(
      values([
        order({ orderId: '20', side: OrderSide.Sell, quantity: 4, createdOn: sameTime }),
        order({ orderId: '10', quantity: 10, createdOn: sameTime }),
      ]),
    ).toEqual([1000, 600]);
  });

  it('is empty for an empty history', () => {
    expect(investedOverTime([])).toEqual([]);
  });
});
