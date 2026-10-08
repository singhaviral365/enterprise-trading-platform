import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { SymbolPnl } from '../../../api/generated/portfolio';

import { AccountOverviewStore } from '../../../core/account-overview.store';
import { PortfolioStore } from '../../../core/portfolio.store';
import { LineChart, LinePoint } from '../../../shared/ui/line-chart/line-chart';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { timeOf } from '../portfolio-performance/performance-stats';

interface RealisedRangeModel {
  from: string;
  to: string;
}

/** The breakdown as a CSV file's text: a header row, then one row per instrument. Numbers are plain, so a spreadsheet reads them. */
export function breakdownCsv(rows: readonly SymbolPnl[], currency: string): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [['Instrument', `Realised (${currency})`, `Unrealised (${currency})`, `Total (${currency})`].map(quote).join(',')];
  for (const row of rows) {
    lines.push([quote(row.symbol), row.realisedPnl.toFixed(2), row.unrealisedPnl.toFixed(2), row.totalPnl.toFixed(2)].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * The Profit and loss tab: what was made, instrument by instrument. A table with a realised date filter (which bounds the realised
 * figure only), the realised result over time (what has been banked, and when) and a CSV download of the table. Table first, filter first.
 *
 * It loads independently of the rest: applying the filter reloads only the table, with its own spinner.
 */
@Component({
  selector: 'app-portfolio-pnl',
  imports: [FormField, LineChart, PnlValue, Spinner],
  templateUrl: './portfolio-pnl.html',
  styleUrls: ['../portfolio-shared.css', './portfolio-pnl.css'],
})
export class PortfolioPnl {
  protected readonly accounts = inject(AccountOverviewStore);
  protected readonly store = inject(PortfolioStore);

  protected readonly currency = computed(
    () => this.store.snapshot()?.summary.baseCurrency ?? this.accounts.linked()?.overview.balance.currency ?? 'USD',
  );
  protected readonly breakdown = computed(() => this.store.pnlSnapshot()?.bySymbol ?? []);
  protected readonly rangeApplied = computed(() => this.store.from() !== '' || this.store.to() !== '');

  /** The realised-profit-and-loss date filter. Only what is being typed lives here; the applied range lives in the store. */
  protected readonly range = signal<RealisedRangeModel>({ from: '', to: '' });
  protected readonly rangeForm = form(this.range, (path) => {
    validate(path.to, ({ value, valueOf }) =>
      value() && valueOf(path.from) && valueOf(path.from) > value()
        ? { kind: 'range', message: 'The start date must not be after the end date.' }
        : undefined,
    );
  });

  /** What has been banked, day by day: the running realised total from the closed-day history (V9). */
  protected readonly realisedOverTime = computed<readonly LinePoint[]>(() =>
    (this.store.history()?.points ?? []).map((point) => ({ time: timeOf(point.date), value: point.realisedPnlCumulative })),
  );
  protected readonly realisedLabel = computed(() => {
    const points = this.realisedOverTime();
    if (points.length < 2) {
      return 'Realised profit and loss over time, not enough history yet';
    }
    const last = points[points.length - 1].value;
    return `Realised profit and loss over time, ${last >= 0 ? 'up' : 'down'} to ${last.toFixed(2)} ${this.currency()}`;
  });
  protected readonly formatMoney = (value: number): string =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency() }).format(value);

  protected applyRange(event: Event): void {
    event.preventDefault();
    if (this.rangeForm().invalid()) {
      return;
    }
    const { from, to } = this.range();
    this.store.setRealisedRange(from, to);
  }

  protected clearRange(): void {
    this.range.set({ from: '', to: '' });
    this.store.setRealisedRange('', '');
  }

  /** Downloads the table as it is shown (so with the filter that is applied). */
  protected exportCsv(): void {
    const text = breakdownCsv(this.breakdown(), this.currency());
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'profit-and-loss.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
