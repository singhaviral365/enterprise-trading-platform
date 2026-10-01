import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderSide, OrderStatus } from '../../../api/generated/trade';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { OrderSortKey, SortDirection, sortOrders } from '../../../core/order-history';
import { MultiDropdown } from '../../../shared/ui/multi-dropdown/multi-dropdown';
import type { DropdownOption } from '../../../shared/ui/dropdown/dropdown';
import { OrderStatusBadge } from '../../../shared/ui/order-status/order-status';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';

const PAGE_SIZE = 10;

/**
 * The order blotter: every order for the linked account, rejections included, sorted by Placed (newest
 * first by default) or Symbol, and filterable by side and status. It only ever reads: the account store
 * loads the data and re-reads it on a bounded interval while anything is at NEW (see
 * `AccountOverviewStore`). It never re-posts an order: the same idempotency key would return a conflict
 * and a new key would place a second order.
 */
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MultiDropdown, OrderStatusBadge, Pagination, RouterLink, Spinner, Tooltip],
  templateUrl: './order-history.html',
  styleUrl: './order-history.css',
})
export class OrderHistory {
  protected readonly OrderSide = OrderSide;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly store = inject(AccountOverviewStore);

  protected readonly sideOptions: readonly DropdownOption[] = [
    { value: OrderSide.Buy, label: 'Buy' },
    { value: OrderSide.Sell, label: 'Sell' },
  ];
  protected readonly statusOptions: readonly DropdownOption[] = [
    { value: OrderStatus.New, label: 'Working' },
    { value: OrderStatus.Filled, label: 'Filled' },
    { value: OrderStatus.Rejected, label: 'Rejected' },
    { value: OrderStatus.Cancelled, label: 'Cancelled' },
  ];

  /** Empty means "no filter". */
  protected readonly sides = signal<readonly string[]>([]);
  protected readonly statuses = signal<readonly string[]>([]);
  protected readonly filtersActive = computed(() => this.sides().length > 0 || this.statuses().length > 0);

  protected readonly sort = signal<{ key: OrderSortKey; direction: SortDirection }>({ key: 'placed', direction: 'desc' });

  protected readonly allOrders = computed(() => this.store.linked()?.overview.orders ?? []);
  protected readonly currency = computed(() => this.store.linked()?.overview.balance.currency ?? null);

  protected readonly rows = computed(() => {
    const sides = this.sides();
    const statuses = this.statuses();
    const { key, direction } = this.sort();
    const matching = this.allOrders().filter(
      (order) =>
        (sides.length === 0 || sides.includes(order.side)) && (statuses.length === 0 || statuses.includes(order.status)),
    );
    return sortOrders(matching, key, direction);
  });

  /** Back to page 1 whenever the filters or the sort change. */
  protected readonly page = linkedSignal<unknown, number>({
    source: () => ({ sides: this.sides(), statuses: this.statuses(), sort: this.sort() }),
    computation: () => 1,
  });
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.rows().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  protected sortBy(key: OrderSortKey): void {
    this.sort.update((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // A new column starts the natural way round: newest first, A to Z.
          { key, direction: key === 'placed' ? 'desc' : 'asc' },
    );
  }

  protected ariaSort(key: OrderSortKey): 'ascending' | 'descending' | 'none' {
    const { key: current, direction } = this.sort();
    if (current !== key) {
      return 'none';
    }
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: OrderSortKey): string {
    const state = this.ariaSort(key);
    return state === 'ascending' ? 'fas fa-sort-up' : state === 'descending' ? 'fas fa-sort-down' : 'fas fa-sort';
  }

  protected resetFilters(): void {
    this.sides.set([]);
    this.statuses.set([]);
  }
}
