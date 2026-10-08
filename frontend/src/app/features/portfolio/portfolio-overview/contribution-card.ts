import { Component, computed, inject } from '@angular/core';

import { FormatPreferences } from '../../../core/format-preferences';
import { PortfolioStore } from '../../../core/portfolio.store';
import { BarChart } from '../../../shared/ui/bar-chart/bar-chart';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { contributionBars } from '../portfolio-analytics';

/**
 * "Which holdings explain my profit?" Horizontal bars, best first, green for what made money and red for what lost it, from the same
 * per-instrument figures as the Profit and loss tab (realised plus unrealised). The sentence under the title names the best and the worst.
 */
@Component({
  selector: 'app-contribution-card',
  imports: [BarChart, PnlValue],
  template: `
    <section class="card panel" aria-labelledby="contribution-title" data-testid="contribution-card">
      <div class="section-head">
        <h2 id="contribution-title" class="card-title">Who made the money</h2>
      </div>
      @if (store.pnl.isLoading() && !store.pnl.hasValue()) {
        <p class="portfolio-note" aria-live="polite">Loading…</p>
      } @else if (bars().length) {
        <p class="chart-takeaway" data-testid="contribution-takeaway">
          @if (best(); as top) {
            {{ top.label }} made the most:
            <app-pnl-value [amount]="top.value" [currency]="currency()" />
          }
          @if (worst(); as bottom) {
            ; {{ bottom.label }} lost the most:
            <app-pnl-value [amount]="bottom.value" [currency]="currency()" />
          }
        </p>
        <app-bar-chart
          orientation="bar"
          [bars]="bars()"
          seriesName="Profit and loss"
          [valueFormatter]="format()"
          [ariaLabel]="ariaLabel()"
          [height]="chartHeight()"
        />
      } @else {
        <p class="portfolio-note" data-testid="contribution-empty">No profit or loss to show yet.</p>
      }
    </section>
  `,
  styleUrls: ['../portfolio-shared.css'],
})
export class ContributionCard {
  protected readonly store = inject(PortfolioStore);
  private readonly formats = inject(FormatPreferences);

  protected readonly currency = computed(() => this.store.pnlSnapshot()?.baseCurrency ?? 'USD');
  protected readonly bars = computed(() => contributionBars(this.store.pnlSnapshot()?.bySymbol ?? []));
  protected readonly best = computed(() => {
    const first = this.bars()[0];
    return first && first.value > 0 ? first : null;
  });
  protected readonly worst = computed(() => {
    const bars = this.bars();
    const last = bars[bars.length - 1];
    return bars.length > 1 && last && last.value < 0 ? last : null;
  });
  protected readonly format = computed(() => {
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency: this.currency() });
    return (value: number) => formatter.format(value);
  });
  /** A bar needs about 36px, plus room for the axis. */
  protected readonly chartHeight = computed(() => Math.max(180, this.bars().length * 36 + 40));
  protected readonly ariaLabel = computed(
    () =>
      'Profit and loss by instrument, best first: ' +
      this.bars()
        .map((bar) => `${bar.label} ${this.format()(bar.value)}`)
        .join(', '),
  );
}
