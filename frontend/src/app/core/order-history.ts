import { OrderHistoryEntry, OrderStatus } from '../api/generated/trade';

/** Newest first by `createdOn`. Never trusts the server's order, and keeps it for equal or unreadable dates. */
export function newestFirst(orders: readonly OrderHistoryEntry[]): OrderHistoryEntry[] {
  const time = (order: OrderHistoryEntry): number => {
    const value = Date.parse(order.createdOn);
    return Number.isNaN(value) ? 0 : value;
  };
  return [...orders].sort((a, b) => time(b) - time(a));
}

/** An order at NEW is still working: the executor has not filled, rejected or cancelled it yet. */
export function isWorking(order: OrderHistoryEntry): boolean {
  return order.status === OrderStatus.New;
}
