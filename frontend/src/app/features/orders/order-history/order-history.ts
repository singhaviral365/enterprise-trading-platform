import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrderSide, OrderStatus } from '../../../api/generated/trade';
import { TradeApi } from '../../../api/trade-api.service';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { DialogService } from '../../../core/dialog.service';
import { describeError } from '../../../core/errors/describe-error';
import { NotificationService } from '../../../core/notification.service';
import { OrderSortKey, SortDirection, isWorking, sortOrders } from '../../../core/order-history';
import { MultiDropdown } from '../../../shared/ui/multi-dropdown/multi-dropdown';
import type { DropdownOption } from '../../../shared/ui/dropdown/dropdown';
import { OrderStatusBadge } from '../../../shared/ui/order-status/order-status';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';

const PAGE_SIZE = 10;

/**
 * The order blotter: every order for the linked account, rejections included, sorted by Placed (newest
 * first by default) or Symbol, and filterable by side and status. The account store loads the data and
 * re-reads it on a bounded interval while anything is at NEW (see `AccountOverviewStore`). It never
 * re-posts an order: the same idempotency key would return a conflict and a new key would place a second one.
 *
 * Rows still working (NEW) can be selected, several at once; a delete button then appears and, after a
 * confirmation, cancels them with `DELETE /api/v1/orders/{id}`.
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
  private readonly trade = inject(TradeApi);
  private readonly dialog = inject(DialogService);
  private readonly notifications = inject(NotificationService);

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

  /** Ids the user has clicked. Only `selectedIds` (below) is trusted: it drops anything no longer cancellable. */
  private readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly cancelling = signal(false);

  /** Selected orders that are still working and still match the filters (a hidden row is never cancelled). */
  protected readonly selectedIds = computed(() => {
    const picked = this.picked();
    return new Set(this.rows().filter((order) => isWorking(order) && picked.has(order.orderId)).map((o) => o.orderId));
  });

  protected isCancellable(order: { status: OrderStatus }): boolean {
    return order.status === OrderStatus.New;
  }

  protected readonly cancelLabel = computed(() => {
    const count = this.selectedIds().size;
    return count === 1 ? 'Cancel selected order' : `Cancel ${count} selected orders`;
  });

  protected rowLabel(order: { symbol: string; orderId: string; status: OrderStatus }): string | null {
    if (!this.isCancellable(order)) {
      return null;
    }
    return `${this.isSelected(order.orderId) ? 'Selected' : 'Select'} working order, ${order.symbol}`;
  }

  protected onSpace(event: Event, order: { orderId: string; status: OrderStatus }): void {
    if (this.isCancellable(order)) {
      event.preventDefault();
      this.toggle(order.orderId);
    }
  }

  protected isSelected(orderId: string): boolean {
    return this.selectedIds().has(orderId);
  }

  protected toggle(orderId: string): void {
    if (this.cancelling()) {
      return;
    }
    this.picked.update((current) => {
      const next = new Set(current);
      if (!next.delete(orderId)) {
        next.add(orderId);
      }
      return next;
    });
  }

  /** Asks first, then cancels every selected order; one failure does not stop the others. */
  protected async cancelSelected(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0 || this.cancelling()) {
      return;
    }
    const many = ids.length > 1;
    const confirmed = await this.dialog.confirm({
      title: many ? `Cancel ${ids.length} orders?` : 'Cancel this order?',
      message: many
        ? `${ids.length} working orders will be cancelled. This cannot be undone.`
        : 'This working order will be cancelled. This cannot be undone.',
      type: 'warning',
      confirmText: many ? 'Cancel orders' : 'Cancel order',
      cancelText: 'Keep',
    });
    if (!confirmed) {
      return;
    }

    this.cancelling.set(true);
    const results = await Promise.allSettled(ids.map((id) => firstValueFrom(this.trade.cancelOrder(id))));
    this.cancelling.set(false);
    this.picked.set(new Set());

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    const cancelled = results.length - failed.length;
    if (cancelled > 0) {
      this.notifications.success(cancelled === 1 ? 'Order cancelled' : `${cancelled} orders cancelled`);
    }
    if (failed.length > 0) {
      const reason = describeError(failed[0].reason);
      this.notifications.error(
        failed.length === 1
          ? `One order could not be cancelled. ${reason}`
          : `${failed.length} orders could not be cancelled. ${reason}`,
      );
    }
    this.store.refresh();
  }

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
