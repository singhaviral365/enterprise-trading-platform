import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountStatus, OrderSide, OrderStatus } from '../../api/generated/trade';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { FormatPreferences } from '../../core/format-preferences';
import { investedOverTime } from '../../core/invested-history';
import { newestFirst } from '../../core/order-history';
import { SessionService } from '../../core/session.service';
import { DonutChart, DonutSlice, DONUT_COLOR_COUNT } from '../../shared/ui/donut-chart/donut-chart';
import { LinePoint, LineChart } from '../../shared/ui/line-chart/line-chart';
import { InstrumentLabel } from '../../shared/ui/instrument-label/instrument-label';
import { OrderStatusBadge } from '../../shared/ui/order-status/order-status';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { WatchlistPanel } from './watchlist/watchlist';
import { CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe } from '../../shared/formatting/preference-pipes';

/** How many orders the Recent orders panel shows; the full list lives on the Order history page. */
const RECENT_ORDER_LIMIT = 5;


/** Order statuses that still count as "open" (not yet finished one way or another). */
const CLOSED_ORDER_STATUSES: ReadonlySet<string> = new Set<string>([
  OrderStatus.Filled,
  OrderStatus.Cancelled,
  OrderStatus.Rejected,
  'EXPIRED',
]);

/** Name of the slice that groups the smallest holdings once there are more than the chart has colours for. */
export const OTHER_SLICE = 'Other';

/**
 * Signed-in landing page, about the user's own account: balances, how the investments are spread (a donut with
 * the total in the middle, linking to the Portfolio page), where the portfolio history chart will go, the
 * watchlist and recent orders. Live market data has its own page in the sidebar.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    CompactMoneyPipe,
    PreferenceCurrencyPipe,
    PreferenceDatePipe,
    PreferenceDecimalPipe,
    DonutChart,
    InstrumentLabel,
    LineChart,
    OrderStatusBadge,
    RouterLink,
    Spinner,
    WatchlistPanel
  ],
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
  private readonly formats = inject(FormatPreferences);

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

  protected readonly currency = computed(() => this.linked()?.overview.balance.currency ?? 'USD');

  /**
   * One slice per holding, biggest first, sized by cost basis. The chart has ten colours, so with more
   * holdings than that the smallest ones are grouped into "Other".
   */
  protected readonly allocation = computed<readonly DonutSlice[]>(() => {
    const slices = (this.linked()?.overview.positions ?? [])
      .map((position) => ({
        name: position.symbol,
        detail: position.instrumentName,
        value: position.quantity * position.averageCost,
      }))
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value);
    if (slices.length <= DONUT_COLOR_COUNT) {
      return slices;
    }
    const shown = slices.slice(0, DONUT_COLOR_COUNT - 1);
    const rest = slices.slice(DONUT_COLOR_COUNT - 1);
    return [
      ...shown,
      {
        name: OTHER_SLICE,
        detail: `${rest.length} more holdings`,
        value: rest.reduce((sum, slice) => sum + slice.value, 0),
      },
    ];
  });

  /** Money for the chart's legend, tooltip and centre, in the account currency. */
  protected readonly formatMoney = computed(() => {
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency: this.currency() });
    return (value: number) => formatter.format(value);
  });

  /** Short axis labels ("$3K") so the value axis takes little room. */
  protected readonly formatAxis = computed(() => {
    const formatter = new Intl.NumberFormat(this.formats.locale(), {
      style: 'currency',
      currency: this.currency(),
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return (value: number) => formatter.format(value);
  });

  protected readonly allocationLabel = computed(
    () =>
      `Donut chart of your investments by cost, totalling ${this.formatMoney()(this.investedValue())}: ` +
      this.allocation()
        .map((slice) => `${slice.name} ${this.formatMoney()(slice.value)}`)
        .join(', '),
  );

  /**
   * "Invested at cost" over time: the cost basis after each filled order, held until the next one and carried to
   * now. Rebuilt from the order history, so it needs no stored snapshots (see `core/invested-history.ts`).
   */
  protected readonly investedHistory = computed<readonly LinePoint[]>(() => {
    const history = investedOverTime(this.linked()?.overview.orders ?? []);
    if (history.length === 0) {
      return [];
    }
    const points = history.map((point) => ({ time: point.time, value: point.invested }));
    const last = points[points.length - 1];
    return Date.now() > last.time ? [...points, { time: Date.now(), value: last.value }] : points;
  });

  protected readonly investedHistoryLabel = computed(() => {
    const points = this.investedHistory();
    if (points.length === 0) {
      return '';
    }
    const format = this.formatMoney();
    const first = new Date(points[0].time).toLocaleDateString('en-GB');
    return `Line chart of the cost of your holdings over time, from ${first}: now ${format(points[points.length - 1].value)}, highest ${format(Math.max(...points.map((p) => p.value)))}.`;
  });

  protected openAccountSetup(): void {
    this.authDialog.open('account');
  }
}
