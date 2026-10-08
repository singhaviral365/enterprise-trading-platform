import { Service, computed, inject } from '@angular/core';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { PortfolioStore } from '../../core/portfolio.store';
import { PositionRow, toPricedRows, toUnpricedRows } from './position-row';

/**
 * The holdings as rows, shared by every portfolio tab and the shell: priced when prices are up and listed unpriced when they are
 * not. The account store supplies names, logos and quantities; the portfolio store supplies prices.
 */
@Service()
export class HoldingsRows {
  private readonly accounts = inject(AccountOverviewStore);
  private readonly store = inject(PortfolioStore);

  readonly held = computed(() => this.accounts.linked()?.overview.positions ?? []);

  /** Every holding, priced when prices are up and listed unpriced when they are not. */
  readonly rows = computed<readonly PositionRow[]>(() => {
    const snapshot = this.store.snapshot();
    return snapshot ? toPricedRows(snapshot.positions, this.held()) : toUnpricedRows(this.held());
  });
  readonly unpricedCount = computed(() => this.rows().filter((row) => row.pricing?.status === 'unavailable').length);
  /** Some price that was served is old (or kept after a failed refresh). */
  readonly anyDelayed = computed(() => this.rows().some((row) => row.pricing?.status === 'delayed'));
  /** What the holdings cost, for the page that cannot price them. */
  readonly totalCost = computed(() => this.rows().reduce((sum, row) => sum + row.costBasis, 0));
}
