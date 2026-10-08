import { Component, computed, inject, signal } from '@angular/core';

import { PortfolioStore } from '../../../core/portfolio.store';
import { FormatPreferences } from '../../../core/format-preferences';
import { DonutChart } from '../../../shared/ui/donut-chart/donut-chart';
import { HoldingsRows } from '../holdings-rows';
import { AllocationBy, allocationSlices, pricedHoldings, topShare } from '../portfolio-analytics';

/**
 * "Where is my money, and am I concentrated?" A donut of the priced holdings, by instrument or by the currency they are quoted in, with
 * the answer in a sentence under the title ("Your top 3 holdings are 68% of your portfolio"). The total in the middle is the market value.
 */
@Component({
  selector: 'app-allocation-card',
  imports: [DonutChart],
  template: `
    <section class="card panel" aria-labelledby="allocation-title" data-testid="allocation-card">
      <div class="section-head">
        <h2 id="allocation-title" class="card-title">Allocation</h2>
        <div class="view-toggle" role="group" aria-label="Group by">
          <button
            type="button"
            class="btn is-small"
            [class.is-primary]="by() === 'instrument'"
            [class.is-tertiary]="by() !== 'instrument'"
            [attr.aria-pressed]="by() === 'instrument'"
            data-testid="allocation-by-instrument"
            (click)="by.set('instrument')"
          >
            Instrument
          </button>
          <button
            type="button"
            class="btn is-small"
            [class.is-primary]="by() === 'currency'"
            [class.is-tertiary]="by() !== 'currency'"
            [attr.aria-pressed]="by() === 'currency'"
            data-testid="allocation-by-currency"
            (click)="by.set('currency')"
          >
            Currency
          </button>
        </div>
      </div>
      @if (slices().length) {
        <p class="chart-takeaway" data-testid="allocation-takeaway">{{ takeaway() }}</p>
        <app-donut-chart
          [slices]="slices()"
          centerLabel="Invested"
          [centerValue]="format()(total())"
          [valueFormatter]="format()"
          [ariaLabel]="ariaLabel()"
        />
      } @else {
        <p class="portfolio-note" data-testid="allocation-empty">Nothing priced to show yet.</p>
      }
    </section>
  `,
  styleUrls: ['../portfolio-shared.css'],
})
export class AllocationCard {
  private readonly holdings = inject(HoldingsRows);
  private readonly store = inject(PortfolioStore);
  private readonly formats = inject(FormatPreferences);

  protected readonly by = signal<AllocationBy>('instrument');

  private readonly currency = computed(() => this.store.snapshot()?.summary.baseCurrency ?? 'USD');
  protected readonly slices = computed(() => allocationSlices(this.holdings.rows(), this.by(), this.currency()));
  protected readonly total = computed(() => this.slices().reduce((sum, slice) => sum + slice.value, 0));
  protected readonly format = computed(() => {
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency: this.currency() });
    return (value: number) => formatter.format(value);
  });

  protected readonly takeaway = computed(() => {
    const slices = this.slices();
    if (slices.length === 0) {
      return '';
    }
    const total = this.total();
    if (this.by() === 'currency') {
      const first = slices[0];
      return `${Math.round((first.value / total) * 100)}% of your holdings are in ${first.name}.`;
    }
    const holdings = pricedHoldings(this.holdings.rows());
    if (holdings.length === 1) {
      return `Everything you hold is in ${holdings[0].symbol}.`;
    }
    const count = Math.min(3, holdings.length);
    const share = topShare(this.holdings.rows(), count) ?? 0;
    return `Your top ${count} holdings are ${Math.round(share)}% of your portfolio.`;
  });
  protected readonly ariaLabel = computed(
    () =>
      `Donut chart of your holdings by ${this.by()}: ` +
      this.slices()
        .map((slice) => `${slice.name} ${Math.round((slice.value / (this.total() || 1)) * 100)} percent`)
        .join(', '),
  );
}
