import { Component, computed, inject } from '@angular/core';

import { FormatPreferences } from '../../../core/format-preferences';
import { PortfolioStore } from '../../../core/portfolio.store';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { TreemapChart } from '../../../shared/ui/treemap-chart/treemap-chart';
import { HoldingsRows } from '../holdings-rows';
import { biggestMover, treemapItems } from '../portfolio-analytics';

/**
 * "What moved today, and does it matter to me?" A treemap of the priced holdings: a block's size is what it is worth, its colour how it
 * moved since the previous close. A big block that moved is news; a small one is not. The sentence names the biggest mover in money.
 */
@Component({
  selector: 'app-movers-card',
  imports: [PnlValue, TreemapChart],
  template: `
    <section class="card panel" aria-labelledby="movers-title" data-testid="movers-card">
      <div class="section-head">
        <h2 id="movers-title" class="card-title">What moved today</h2>
      </div>
      @if (items().length) {
        <p class="chart-takeaway" data-testid="movers-takeaway">
          @if (mover(); as top) {
            Biggest mover: {{ top.symbol }}
            <app-pnl-value [amount]="top.dayPnl" [percent]="top.dayPnlPercent" [currency]="currency()" />
          } @else {
            Day figures are not available yet.
          }
        </p>
        <app-treemap-chart
          [items]="items()"
          valueName="Market value"
          changeName="Today"
          [valueFormatter]="format()"
          [ariaLabel]="ariaLabel()"
        />
      } @else {
        <p class="portfolio-note" data-testid="movers-empty">Nothing priced to show yet.</p>
      }
    </section>
  `,
  styleUrls: ['../portfolio-shared.css'],
})
export class MoversCard {
  private readonly holdings = inject(HoldingsRows);
  private readonly store = inject(PortfolioStore);
  private readonly formats = inject(FormatPreferences);

  protected readonly currency = computed(() => this.store.snapshot()?.summary.baseCurrency ?? 'USD');
  protected readonly items = computed(() => treemapItems(this.holdings.rows()));
  protected readonly mover = computed(() => biggestMover(this.holdings.rows()));
  protected readonly format = computed(() => {
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency: this.currency() });
    return (value: number) => formatter.format(value);
  });
  protected readonly ariaLabel = computed(
    () =>
      'Treemap of your holdings, sized by value and coloured by today\'s move: ' +
      this.items()
        .map((item) => `${item.name} ${item.change === null ? 'no move known' : `${item.change.toFixed(2)} percent`}`)
        .join(', '),
  );
}
