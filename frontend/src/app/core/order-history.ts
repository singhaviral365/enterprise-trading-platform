import { OrderHistoryEntry, OrderStatus } from '../api/generated/trade';

export type OrderSortKey = 'placed' | 'symbol';
export type SortDirection = 'asc' | 'desc';

function placedAt(order: OrderHistoryEntry): number {
  const value = Date.parse(order.createdOn);
  return Number.isNaN(value) ? 0 : value;
}

/** Newest first by `createdOn`. Never trusts the server's order, and keeps it for equal or unreadable dates. */
export function newestFirst(orders: readonly OrderHistoryEntry[]): OrderHistoryEntry[] {
  return [...orders].sort((a, b) => placedAt(b) - placedAt(a));
}

/** Sorts by placed time or symbol. Equal keys fall back to newest first, so the order is always stable. */
export function sortOrders(
  orders: readonly OrderHistoryEntry[],
  key: OrderSortKey,
  direction: SortDirection,
): OrderHistoryEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...orders].sort((a, b) => {
    const primary = key === 'placed' ? placedAt(a) - placedAt(b) : a.symbol.localeCompare(b.symbol);
    return primary !== 0 ? sign * primary : placedAt(b) - placedAt(a);
  });
}

/** An order at NEW is still working: the executor has not filled, rejected or cancelled it yet. */
export function isWorking(order: OrderHistoryEntry): boolean {
  return order.status === OrderStatus.New;
}
