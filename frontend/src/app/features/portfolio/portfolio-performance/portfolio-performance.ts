import { Component, computed, inject, linkedSignal, signal } from '@angular/core';

import { NavPoint, PerformanceResponse } from '../../../api/generated/portfolio-performance';
import { PortfolioStore } from '../../../core/portfolio.store';
import {
  PreferenceCurrencyPipe,
  PreferenceDatePipe,
  PreferenceDecimalPipe,
} from '../../../shared/formatting/preference-pipes';
import { LineChart, LinePoint } from '../../../shared/ui/line-chart/line-chart';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { percentFromStart, rangeStats, timeOf } from './performance-stats';

export type PerformanceRange = '1M' | '3M' | '6M' | '1Y' | 'All';

export const PERFORMANCE_RANGES: readonly { readonly id: PerformanceRange; readonly days: number | null }[] = [
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
  { id: 'All', days: null },
];

/** The benchmark offered for comparison. The server only accepts the symbols it is configured with. */
export const BENCHMARK_SYMBOL = 'SPY';

/** How many closed days the statements table shows before "Show all". */
export const STATEMENT_ROWS = 30;

/**
 * How the account has performed, from the closed-day statements: a curve of percent change from the start of the chosen range
 * (so every range starts at 0%), optionally against a benchmark, the range's figures, and the daily statements.
 *
 * It measures with the NAV (unit price), so money put in or taken out does not look like a gain or a loss. Changing the range
 * re-bases what is already loaded and needs no request; the benchmark toggle reloads only this section, with its own spinner.
 * The chart is the shared line chart, labelled for assistive technology; the figures and statements carry the numbers.
 */
@Component({
  selector: 'app-portfolio-performance',
  imports: [LineChart, PnlValue, PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe, Spinner],
  templateUrl: './portfolio-performance.html',
  styleUrl: './portfolio-performance.css',
})
export class PortfolioPerformance {
  protected readonly store = inject(PortfolioStore);

  protected readonly ranges = PERFORMANCE_RANGES;
  protected readonly benchmarkSymbol = BENCHMARK_SYMBOL;
  protected readonly range = signal<PerformanceRange>('All');
  protected readonly showAllStatements = signal(false);

  protected readonly history = this.store.history;
  /** The last history shown: keeps the range and benchmark controls in place while a new one loads. */
  protected readonly lastHistory = linkedSignal<PerformanceResponse | null, PerformanceResponse | null>({
    source: this.history,
    computation: (history, previous) => history ?? previous?.value ?? null,
  });
  protected readonly currency = computed(() => this.history()?.baseCurrency ?? 'USD');
  protected readonly benchmarkOn = computed(() => this.store.benchmark() !== '');

  /** The closed days in the chosen range, oldest first. */
  protected readonly visible = computed<readonly NavPoint[]>(() => {
    const points = this.history()?.points ?? [];
    const days = PERFORMANCE_RANGES.find((candidate) => candidate.id === this.range())?.days ?? null;
    if (days === null || points.length === 0) {
      return points;
    }
    const cutoff = timeOf(points[points.length - 1].date) - days * 86_400_000;
    return points.filter((point) => timeOf(point.date) >= cutoff);
  });

  protected readonly stats = computed(() => (this.visible().length ? rangeStats(this.visible()) : null));
  protected readonly line = computed<readonly LinePoint[]>(() => percentFromStart(this.visible()));
  /** The benchmark over the same days, as percent change from its own first day in the range; null when off or not available. */
  protected readonly comparison = computed<readonly LinePoint[] | null>(() => {
    const benchmark = this.history()?.benchmark;
    const first = this.visible()[0];
    if (!benchmark || !first) {
      return null;
    }
    const inRange = benchmark.points.filter((candidate) => candidate.date >= first.date);
    return inRange.length > 1 ? percentFromStart(inRange) : null;
  });
  /** Asked for but nothing came back for it: say so instead of quietly drawing one line. */
  protected readonly benchmarkMissing = computed(() => this.benchmarkOn() && !!this.history() && this.comparison() === null);

  protected readonly estimated = computed(() => this.visible().some((point) => point.estimated));
  protected readonly statements = computed<readonly NavPoint[]>(() => {
    const newestFirst = [...this.visible()].reverse();
    return this.showAllStatements() ? newestFirst : newestFirst.slice(0, STATEMENT_ROWS);
  });
  protected readonly hiddenStatements = computed(() => Math.max(0, this.visible().length - STATEMENT_ROWS));

  protected readonly chartLabel = computed(() => {
    const stats = this.stats();
    const points = this.visible();
    if (!stats || points.length < 2) {
      return 'Portfolio performance chart, not enough history yet';
    }
    const direction = stats.returnPct >= 0 ? 'up' : 'down';
    return (
      `Portfolio performance from ${points[0].date} to ${points[points.length - 1].date}: ` +
      `${direction} ${Math.abs(stats.returnPct).toFixed(2)} per cent` +
      (this.comparison() ? `, shown against ${this.history()?.benchmark?.symbol}` : '')
    );
  });

  protected readonly formatPercent = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

  protected pick(range: PerformanceRange): void {
    this.range.set(range);
  }

  protected toggleBenchmark(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.store.setBenchmark(on ? BENCHMARK_SYMBOL : '');
  }
}
