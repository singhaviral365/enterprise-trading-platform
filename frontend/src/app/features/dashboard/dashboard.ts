import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { SessionService } from '../../core/session.service';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { MarketBoardPanel } from './market-board/market-board';
import { WatchlistPanel } from './watchlist/watchlist';

/** Order statuses that still count as "open" (not yet finished one way or another). */
const CLOSED_ORDER_STATUSES = new Set(['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']);

/**
 * Signed-in landing page: account summary (or a prompt to open an account), the live market
 * board, the watchlist and recent orders. Account details live in the header's account menu.
 */
@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, Spinner, MarketBoardPanel, WatchlistPanel],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly session = inject(SessionService);
  private readonly store = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);

  protected readonly data = this.store.data;
  protected readonly linked = this.store.linked;
  protected readonly errorMessage = this.store.errorMessage;

  protected readonly openOrders = computed(
    () => this.linked()?.overview.orders.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status)).length ?? 0,
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
