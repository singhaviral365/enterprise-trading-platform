import {
  OrderHistoryEntry,
  OrderPricingType,
  OrderSide,
  OrderStatus,
} from '../api/generated/trade';
import { positionBreakdown } from './position-lots';

function order(overrides: Partial<OrderHistoryEntry>): OrderHistoryEntry {
  return {
    orderId: '1',
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

describe('positionBreakdown', () => {
  it('turns each filled buy into a lot, oldest first, and weights the average by quantity', () => {
    const result = positionBreakdown(
      [
        order({
          orderId: '2',
          quantity: 30,
          executedPrice: 120,
          createdOn: '2026-09-10T10:00:00Z',
        }),
        order({
          orderId: '1',
          quantity: 10,
          executedPrice: 100,
          createdOn: '2026-09-01T10:00:00Z',
        }),
      ],
      'AAPL',
    );

    expect(result.lots.map((lot) => lot.orderId)).toEqual(['1', '2']);
    expect(result.lots[1]).toMatchObject({ quantity: 30, price: 120, cost: 3600 });
    expect(result.boughtQuantity).toBe(40);
    expect(result.boughtCost).toBe(4600);
    // (10 x 100 + 30 x 120) / 40
    expect(result.averagePrice).toBe(115);
    expect(result.soldQuantity).toBe(0);
  });

  it('ignores other symbols and orders that never filled', () => {
    const result = positionBreakdown(
      [
        order({ orderId: '1' }),
        order({ orderId: '2', symbol: 'MSFT' }),
        order({ orderId: '3', status: OrderStatus.Rejected, executedPrice: null }),
        order({ orderId: '4', status: OrderStatus.New, executedPrice: null }),
        order({ orderId: '5', status: OrderStatus.Cancelled, executedPrice: null }),
      ],
      'AAPL',
    );

    expect(result.lots.map((lot) => lot.orderId)).toEqual(['1']);
  });

  it('counts sells as sold quantity but leaves the average cost alone', () => {
    const result = positionBreakdown(
      [
        order({ orderId: '1', quantity: 10, executedPrice: 100 }),
        order({ orderId: '2', side: OrderSide.Sell, quantity: 4, executedPrice: 150 }),
      ],
      'AAPL',
    );

    expect(result.soldQuantity).toBe(4);
    expect(result.averagePrice).toBe(100);
    expect(result.lots).toHaveLength(1);
  });

  it('falls back to the order price when there is no executed price, and skips a lot with neither', () => {
    const result = positionBreakdown(
      [
        order({ orderId: '1', executedPrice: null, price: 90 }),
        order({ orderId: '2', executedPrice: null, price: null }),
      ],
      'AAPL',
    );

    expect(result.lots.map((lot) => lot.price)).toEqual([90]);
  });

  it('has no average when there are no buys', () => {
    const result = positionBreakdown([], 'AAPL');

    expect(result).toMatchObject({
      lots: [],
      boughtQuantity: 0,
      boughtCost: 0,
      averagePrice: null,
      soldQuantity: 0,
    });
  });

  it('keeps an unreadable date from breaking the order', () => {
    const result = positionBreakdown(
      [
        order({ orderId: '1', createdOn: 'nope' }),
        order({ orderId: '2', createdOn: '2026-09-02T10:00:00Z' }),
      ],
      'AAPL',
    );

    expect(result.lots).toHaveLength(2);
  });
});
