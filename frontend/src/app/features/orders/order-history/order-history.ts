import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, InjectionToken, computed, effect, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrderSide } from '../../../api/generated/trade';
import { TradeApi } from '../../../api/trade-api.service';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { describeError } from '../../../core/errors/describe-error';
import { isWorking, newestFirst } from '../../../core/order-history';
import { OrderStatusBadge } from '../../../shared/ui/order-status/order-status';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { Spinner } from '../../../shared/ui/spinner/spinner';

export interface OrderPollConfig {
  /** Pause between re-reads while something is at NEW. */
  readonly intervalMs: number;
  /** Re-reads allowed before automatic updates pause; the Refresh button grants a fresh allowance. */
  readonly maxPolls: number;
}

/** 12 re-reads, 5 seconds apart: about a minute of automatic updates, never an endless loop. */
export const ORDER_POLL = new InjectionToken<OrderPollConfig>('ORDER_POLL', {
  factory: () => ({ intervalMs: 5000, maxPolls: 12 }),
});

const PAGE_SIZE = 10;

/**
 * The order blotter: every order for the linked account, newest first, rejections included.
 * It only ever reads (`GET /accounts/{id}/orders`). It never re-posts an order: the same idempotency
 * key would return a conflict and a new key would place a second order.
 *
 * While any order is at NEW the list is re-read on a bounded interval; it stops as soon as nothing is
 * working, or when the allowance runs out. The user can always press Refresh.
 */
@Component({
  selector: 'app-order-history',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, OrderStatusBadge, Pagination, RouterLink, Spinner],
  templateUrl: './order-history.html',
  styleUrl: './order-history.css',
})
export class OrderHistory {
  protected readonly OrderSide = OrderSide;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly store = inject(AccountOverviewStore);
  private readonly trade = inject(TradeApi);
  private readonly poll = inject(ORDER_POLL);

  private readonly accountId = computed(() => this.store.linked()?.overview.account.id ?? null);
  protected readonly currency = computed(() => this.store.linked()?.overview.balance.currency ?? null);

  protected readonly history = resource({
    params: () => {
      const id = this.accountId();
      return id === null ? undefined : { id };
    },
    loader: ({ params }) => firstValueFrom(this.trade.orderHistory(params.id)),
  });

  protected readonly rows = computed(() => (this.history.hasValue() ? newestFirst(this.history.value() ?? []) : []));
  protected readonly workingCount = computed(() => this.rows().filter(isWorking).length);

  private readonly pollsLeft = signal(this.poll.maxPolls);
  protected readonly autoUpdating = computed(() => this.workingCount() > 0 && this.pollsLeft() > 0);
  protected readonly paused = computed(() => this.workingCount() > 0 && this.pollsLeft() <= 0);

  protected readonly page = signal(1);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.rows().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  protected readonly errorMessage = computed(() => {
    const error = this.history.error();
    return error ? describeError(error) : '';
  });

  constructor() {
    // Waits for each read to finish, then schedules the next one. Nothing is scheduled once no order
    // is at NEW, the allowance is spent, or the component is gone (the cleanup clears the timer).
    effect((onCleanup) => {
      if (this.history.isLoading() || this.workingCount() === 0 || this.pollsLeft() <= 0) {
        return;
      }
      const timer = setTimeout(() => {
        this.pollsLeft.update((n) => n - 1);
        this.history.reload();
      }, this.poll.intervalMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected refresh(): void {
    this.pollsLeft.set(this.poll.maxPolls);
    this.history.reload();
  }

  /** Orders are numbered by UUID; the first block is enough to recognise one. */
  protected shortId(orderId: string): string {
    return orderId.slice(0, 8).toUpperCase();
  }
}
