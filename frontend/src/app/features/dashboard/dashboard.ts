import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountStatus, OrderSide, OrderStatus } from '../../api/generated/trade';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { newestFirst } from '../../core/order-history';
import { SessionService } from '../../core/session.service';
import { OrderStatusBadge } from '../../shared/ui/order-status/order-status';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { MarketBoardPanel } from './market-board/market-board';

/** How many orders the Recent orders panel shows; the full list lives on the Order history page. */
const RECENT_ORDER_LIMIT = 5;

/** Order statuses that still count as "open" (not yet finished one way or another). */
const CLOSED_ORDER_STATUSES: ReadonlySet<string> = new Set<string>([
  OrderStatus.Filled,
  OrderStatus.Cancelled,
  OrderStatus.Rejected,
  'EXPIRED',
]);

/**
 * Signed-in landing page: account summary (or a prompt to open an account), the live market
 * board, the watchlist and recent orders. Account details live in the header's account menu.
 */
@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, OrderStatusBadge, RouterLink, Spinner, MarketBoardPanel],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly AccountStatus = AccountStatus;
  protected readonly OrderSide = OrderSide;

  protected readonly session = inject(SessionService);
  private readonly store = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);

  protected readonly data = this.store.data;
  protected readonly linked = this.store.linked;
  protected readonly errorMessage = this.store.errorMessage;

  protected readonly openOrders = computed(
    () => this.linked()?.overview.orders.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status)).length ?? 0,
  );

  protected readonly recentOrders = computed(() =>
    newestFirst(this.linked()?.overview.orders ?? []).slice(0, RECENT_ORDER_LIMIT),
  );

  protected readonly investedValue = computed(
    () =>
      this.linked()?.overview.positions.reduce((sum, position) => sum + position.quantity * position.averageCost, 0) ??
      0,
  );

  protected openAccountSetup(): void {
    this.authDialog.open('account');
  }
}
