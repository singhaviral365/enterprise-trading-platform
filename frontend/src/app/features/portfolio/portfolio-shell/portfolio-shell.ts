import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AccountOverviewStore } from '../../../core/account-overview.store';
import { PortfolioStore } from '../../../core/portfolio.store';
import { CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDatePipe } from '../../../shared/formatting/preference-pipes';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { HoldingsRows } from '../holdings-rows';

/** The portfolio's tabs, in order. Each is a lazy child route, so a tab costs nothing until it is opened. */
export const PORTFOLIO_TABS = [
  { id: 'overview', path: '/portfolio', label: 'Overview', icon: 'fas fa-gauge-high' },
  { id: 'holdings', path: '/portfolio/holdings', label: 'Holdings', icon: 'fas fa-layer-group' },
  { id: 'performance', path: '/portfolio/performance', label: 'Performance', icon: 'fas fa-chart-line' },
  { id: 'pnl', path: '/portfolio/pnl', label: 'Profit and loss', icon: 'fas fa-scale-balanced' },
] as const;

/**
 * What the account is worth now, shared by every portfolio tab: the title, when the prices are from, Refresh, the summary tiles
 * (or the notices when prices are partial or unavailable), a tab bar and the tab itself in the router outlet. The tiles stay on
 * every tab, so context is never lost.
 *
 * Prices come only from the Trade API's portfolio routes. The page says how old they are: a **Delayed** marker when any is stale,
 * and a notice when some holdings could not be priced (the totals then cover the others). When nothing can be priced it does not
 * go blank: it shows the cash and cost it already has, and the tabs list the holdings unpriced, with a way to try again. Gains and
 * losses carry a sign and an arrow as well as a colour.
 *
 * The data lives in {@link PortfolioStore}, so switching tabs never refetches what is already loaded; each tab reads its own
 * extras on demand.
 */
@Component({
  selector: 'app-portfolio',
  imports: [
    PnlValue,
    CompactMoneyPipe,
    PreferenceCurrencyPipe,
    PreferenceDatePipe,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Spinner,
  ],
  templateUrl: './portfolio-shell.html',
  styleUrls: ['../portfolio-shared.css', './portfolio-shell.css'],
})
export class PortfolioShell {
  protected readonly accounts = inject(AccountOverviewStore);
  protected readonly store = inject(PortfolioStore);
  private readonly holdings = inject(HoldingsRows);

  protected readonly tabs = PORTFOLIO_TABS;

  protected readonly summary = computed(() => this.store.snapshot()?.summary ?? null);
  protected readonly currency = computed(
    () => this.summary()?.baseCurrency ?? this.accounts.linked()?.overview.balance.currency ?? 'USD',
  );
  protected readonly cash = computed(() => this.accounts.linked()?.overview.balance.cashBalance ?? 0);
  protected readonly unpricedCount = this.holdings.unpricedCount;
  protected readonly anyDelayed = this.holdings.anyDelayed;
  protected readonly unavailableCost = this.holdings.totalCost;

  constructor() {
    // Reads the portfolio again every minute while the page is open, and stops when it closes.
    effect((onCleanup) => {
      if (this.store.accountId() !== null) {
        onCleanup(this.store.autoRefresh());
      }
    });
  }

  /** The Refresh button: the account (orders, positions) and every section of the portfolio. */
  protected refresh(): void {
    this.accounts.refresh();
    this.store.reload();
  }
}
