import { OrderHistoryEntry, OrderSide, OrderStatus } from '../api/generated/trade';

/** The cost basis of the whole account right after one filled order. */
export interface InvestedPoint {
  /** Epoch milliseconds of the order. */
  readonly time: number;
  /** Total cost of everything held at that moment, in the account currency. */
  readonly invested: number;
}

function timeOf(order: OrderHistoryEntry): number {
  const value = Date.parse(order.createdOn);
  return Number.isNaN(value) ? 0 : value;
}

/** Orders are replayed oldest first; equal times fall back to the order id so the replay is stable. */
function replayOrder(a: OrderHistoryEntry, b: OrderHistoryEntry): number {
  const byTime = timeOf(a) - timeOf(b);
  if (byTime !== 0) {
    return byTime;
  }
  const idA = Number(a.orderId);
  const idB = Number(b.orderId);
  return Number.isFinite(idA) && Number.isFinite(idB) ? idA - idB : 0;
}

/**
 * "Invested at cost" over time, rebuilt from the order history alone. It replays the filled orders oldest first
 * with the executor's weighted-average rule, per symbol: a BUY adds `quantity x price` to the cost, a SELL removes
 * `quantity x (cost / quantity held)` and so leaves the average cost unchanged. The last point is therefore the
 * same number as the "Invested (at cost)" card.
 *
 * It is a cost line, not a performance line: it does not move with market prices. A sell for more than the history
 * says is held (older orders missing) is ignored rather than driving the line negative.
 */
export function investedOverTime(orders: readonly OrderHistoryEntry[]): InvestedPoint[] {
  const held = new Map<string, { quantity: number; cost: number }>();
  let total = 0;
  const points: InvestedPoint[] = [];

  const filled = orders.filter((order) => order.status === OrderStatus.Filled).sort(replayOrder);
  for (const order of filled) {
    const price = order.executedPrice ?? order.price ?? null;
    if (price === null) {
      continue;
    }
    const position = held.get(order.symbol) ?? { quantity: 0, cost: 0 };

    if (order.side === OrderSide.Buy) {
      position.quantity += order.quantity;
      position.cost += order.quantity * price;
      total += order.quantity * price;
    } else if (position.quantity >= order.quantity && position.quantity > 0) {
      const released = (position.cost / position.quantity) * order.quantity;
      position.quantity -= order.quantity;
      position.cost = position.quantity === 0 ? 0 : position.cost - released;
      total -= released;
    } else {
      continue;
    }

    held.set(order.symbol, position);
    points.push({ time: timeOf(order), invested: Math.max(0, total) });
  }
  return points;
}
