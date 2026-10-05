import { OrderHistoryEntry, OrderSide, OrderStatus } from '../api/generated/trade';

/** One filled BUY order: a slice of the position, with what it cost. */
export interface BuyLot {
  readonly orderId: string;
  readonly boughtOn: string;
  readonly quantity: number;
  /** Fill price per unit, in the account currency. */
  readonly price: number;
  readonly cost: number;
}

/** Where a position's average cost comes from: the filled buys behind it. */
export interface PositionBreakdown {
  /** Oldest first. */
  readonly lots: readonly BuyLot[];
  readonly boughtQuantity: number;
  readonly boughtCost: number;
  /** Total cost of the buys divided by their total quantity; null when there are no buys. */
  readonly averagePrice: number | null;
  /** Shares sold since. Selling reduces the quantity but leaves the average cost alone. */
  readonly soldQuantity: number;
}

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Explains a position from the order history. The Trade Executor keeps a weighted average: every filled BUY
 * adds `quantity x price` to the cost and `quantity` to the holding, and every filled SELL only removes
 * quantity. So the average cost is the total cost of all filled buys divided by their total quantity, which
 * is exactly what the lots below add up to.
 */
export function positionBreakdown(
  orders: readonly OrderHistoryEntry[],
  symbol: string,
): PositionBreakdown {
  const filled = orders.filter(
    (order) => order.symbol === symbol && order.status === OrderStatus.Filled,
  );

  const lots = filled
    .filter((order) => order.side === OrderSide.Buy)
    .map((order): BuyLot | null => {
      const price = order.executedPrice ?? order.price ?? null;
      return price === null
        ? null
        : {
            orderId: order.orderId,
            boughtOn: order.createdOn,
            quantity: order.quantity,
            price,
            cost: order.quantity * price,
          };
    })
    .filter((lot): lot is BuyLot => lot !== null)
    .sort((a, b) => time(a.boughtOn) - time(b.boughtOn));

  const boughtQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const boughtCost = lots.reduce((sum, lot) => sum + lot.cost, 0);
  const soldQuantity = filled
    .filter((order) => order.side === OrderSide.Sell)
    .reduce((sum, order) => sum + order.quantity, 0);

  return {
    lots,
    boughtQuantity,
    boughtCost,
    averagePrice: boughtQuantity > 0 ? boughtCost / boughtQuantity : null,
    soldQuantity,
  };
}
