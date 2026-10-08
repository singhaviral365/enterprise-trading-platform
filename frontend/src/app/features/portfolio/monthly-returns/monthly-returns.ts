import { Component, computed, input } from '@angular/core';

import { NavPoint } from '../../../api/generated/portfolio-performance';
import { MonthReturn, monthBucket, monthlyReturns } from '../portfolio-analytics';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface YearRow {
  readonly year: number;
  readonly cells: readonly (MonthReturn | null)[];
}

/**
 * Which months were good or bad: a strip of cells (a table, so it reads by row and column), one per calendar month that exists, coloured
 * by the month's return and always showing it as text, so colour is never the only signal. With under a year of history it shows only
 * the months there are; the first month (measured from the first day we have) and an unfinished one are marked partial.
 */
@Component({
  selector: 'app-monthly-returns',
  templateUrl: './monthly-returns.html',
  styleUrl: './monthly-returns.css',
})
export class MonthlyReturns {
  /** The closed days, oldest first. */
  readonly points = input.required<readonly NavPoint[]>();

  protected readonly monthNames = MONTH_NAMES;
  protected readonly months = computed(() => monthlyReturns(this.points()));
  protected readonly rows = computed<readonly YearRow[]>(() => {
    const byYear = new Map<number, (MonthReturn | null)[]>();
    for (const month of this.months()) {
      const cells = byYear.get(month.year) ?? Array.from({ length: 12 }, () => null);
      cells[month.month] = month;
      byYear.set(month.year, cells);
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, cells]) => ({ year, cells }));
  });
  /** Which columns have at least one month, so a short history does not show twelve mostly-empty columns. */
  protected readonly visibleMonths = computed(() => {
    const used = new Set(this.months().map((month) => month.month));
    return MONTH_NAMES.map((name, index) => ({ name, index })).filter((month) => used.has(month.index));
  });
  protected readonly anyPartial = computed(() => this.months().some((month) => month.partial));

  protected bucket(returnPct: number): number {
    return monthBucket(returnPct);
  }

  protected format(returnPct: number): string {
    return `${returnPct > 0 ? '+' : ''}${returnPct.toFixed(1)}%`;
  }
}
