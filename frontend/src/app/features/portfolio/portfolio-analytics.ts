import { SymbolPnl } from '../../api/generated/portfolio';
import { NavPoint } from '../../api/generated/portfolio-performance';
import type { Bar } from '../../shared/ui/bar-chart/bar-chart';
import type { DonutSlice } from '../../shared/ui/donut-chart/donut-chart';
import type { LinePoint } from '../../shared/ui/line-chart/line-chart';
import type { TreemapItem } from '../../shared/ui/treemap-chart/treemap-chart';
import { timeOf } from './portfolio-performance/performance-stats';
import { PositionRow } from './position-row';

/** Pure figures behind the portfolio's charts, kept out of the components so each can be checked by itself. */

// ------------------------------------------------------------------------------------------------------ performance

/**
 * How far below its previous peak the account's value (its NAV, so deposits do not look like gains) has been on each day, in
 * percent: 0 at a new high, negative while it is under water. The "underwater" area chart.
 */
export function drawdownSeries(points: readonly NavPoint[]): LinePoint[] {
  let peak = Number.NEGATIVE_INFINITY;
  return points.map((point) => {
    peak = Math.max(peak, point.nav);
    return { time: timeOf(point.date), value: (point.nav / peak - 1) * 100 };
  });
}

/** One column per closed day: that day's profit or loss (value change less money put in, so only prices move it). */
export function dailyPnlBars(points: readonly NavPoint[]): Bar[] {
  return points.map((point) => ({ time: timeOf(point.date), value: point.dayPnl }));
}

/** Realised profit and loss booked so far, day by day, for the line over the daily columns. */
export function realisedCumulative(points: readonly NavPoint[]): LinePoint[] {
  return points.map((point) => ({ time: timeOf(point.date), value: point.realisedPnlCumulative }));
}

/** Whether every point carries the split of its value into cash and holdings (older servers do not send it). */
export function hasValueSplit(points: readonly NavPoint[]): boolean {
  return points.length > 0 && points.every((point) => point.cash !== undefined && point.holdingsValue !== undefined);
}

/** The account's value as two layers: the holdings that are working and the cash that is not. */
export function valueLayers(points: readonly NavPoint[]): { holdings: LinePoint[]; cash: LinePoint[] } {
  return {
    holdings: points.map((point) => ({ time: timeOf(point.date), value: point.holdingsValue ?? 0 })),
    cash: points.map((point) => ({ time: timeOf(point.date), value: point.cash ?? 0 })),
  };
}

/** The share of the latest day's value that is in the market, in percent; null without the split. */
export function investedShare(points: readonly NavPoint[]): number | null {
  const last = points[points.length - 1];
  if (!last || last.holdingsValue === undefined || last.value <= 0) {
    return null;
  }
  return (last.holdingsValue / last.value) * 100;
}

/** One month of the heat strip. `partial` marks the first month (from the first day we have) and an unfinished month. */
export interface MonthReturn {
  readonly year: number;
  /** 0 = January. */
  readonly month: number;
  /** NAV change over the month in percent. */
  readonly returnPct: number;
  readonly partial: boolean;
}

/**
 * Return of each calendar month, from the NAV: this month's last close against the previous month's last close (the first month is
 * measured from the first day we have, and is marked partial). Only months that exist are returned; a month with a single day has
 * nothing to compare with unless a previous month does.
 */
export function monthlyReturns(points: readonly NavPoint[]): MonthReturn[] {
  if (points.length < 2) {
    return [];
  }
  const lastOfMonth = new Map<string, NavPoint>();
  const order: string[] = [];
  for (const point of points) {
    const key = point.date.slice(0, 7);
    if (!lastOfMonth.has(key)) {
      order.push(key);
    }
    lastOfMonth.set(key, point);
  }
  const result: MonthReturn[] = [];
  let previousClose = points[0].nav;
  order.forEach((key, index) => {
    const close = lastOfMonth.get(key)!;
    const [year, month] = key.split('-').map(Number);
    const first = index === 0;
    if (!(first && close.date === points[0].date)) {
      result.push({ year, month: month - 1, returnPct: (close.nav / previousClose - 1) * 100, partial: first || (index === order.length - 1 && !isMonthEnd(close.date)) });
    }
    previousClose = close.nav;
  });
  return result;
}

function isMonthEnd(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`);
  const next = new Date(day.getTime() + 86_400_000);
  return next.getUTCMonth() !== day.getUTCMonth();
}

/** Five steps of colour for a month's return, as the heat strip's cells use them: 0 strong fall .. 4 strong rise. */
export function monthBucket(returnPct: number): 0 | 1 | 2 | 3 | 4 {
  if (Math.abs(returnPct) < 0.25) {
    return 2;
  }
  if (returnPct <= -3) {
    return 0;
  }
  if (returnPct < 0) {
    return 1;
  }
  return returnPct >= 3 ? 4 : 3;
}

// ------------------------------------------------------------------------------------------------------ holdings

export type AllocationBy = 'instrument' | 'currency';

/** The holdings that have a market value, biggest first: the ones an allocation, a treemap or a share can be worked out from. */
export function pricedHoldings(rows: readonly PositionRow[]): PositionRow[] {
  return rows
    .filter((row) => row.pricing?.marketValue != null && row.pricing.marketValue > 0)
    .sort((a, b) => b.pricing!.marketValue! - a.pricing!.marketValue!);
}

/** The donut's slices: one per instrument, or one per currency the instruments are quoted in. */
export function allocationSlices(rows: readonly PositionRow[], by: AllocationBy, fallbackCurrency: string): DonutSlice[] {
  const holdings = pricedHoldings(rows);
  if (by === 'instrument') {
    return holdings.map((row) => ({ name: row.symbol, detail: row.name || null, value: row.pricing!.marketValue! }));
  }
  const byCurrency = new Map<string, number>();
  for (const row of holdings) {
    const code = row.quoteCurrency ?? fallbackCurrency;
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + row.pricing!.marketValue!);
  }
  return [...byCurrency.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

/** What share of the priced holdings the biggest `count` hold, in percent; null with nothing priced. */
export function topShare(rows: readonly PositionRow[], count: number): number | null {
  const holdings = pricedHoldings(rows);
  const total = holdings.reduce((sum, row) => sum + row.pricing!.marketValue!, 0);
  if (total <= 0) {
    return null;
  }
  const top = holdings.slice(0, count).reduce((sum, row) => sum + row.pricing!.marketValue!, 0);
  return (top / total) * 100;
}

/** One block per priced holding: size is its value, colour is how it moved today. */
export function treemapItems(rows: readonly PositionRow[]): TreemapItem[] {
  return pricedHoldings(rows).map((row) => ({
    name: row.symbol,
    detail: row.name || null,
    value: row.pricing!.marketValue!,
    change: row.pricing!.dayPnlPercent,
  }));
}

/** The holding that moved the most today in either direction, weighted by what it is worth to the account. */
export function biggestMover(rows: readonly PositionRow[]): { symbol: string; dayPnl: number; dayPnlPercent: number | null } | null {
  let best: { symbol: string; dayPnl: number; dayPnlPercent: number | null } | null = null;
  for (const row of rows) {
    const dayPnl = row.pricing?.dayPnl;
    if (dayPnl != null && (best === null || Math.abs(dayPnl) > Math.abs(best.dayPnl))) {
      best = { symbol: row.symbol, dayPnl, dayPnlPercent: row.pricing?.dayPnlPercent ?? null };
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------------ profit and loss

/** Bars for who made and who lost the money, best first. */
export function contributionBars(bySymbol: readonly SymbolPnl[]): Bar[] {
  return [...bySymbol].sort((a, b) => b.totalPnl - a.totalPnl).map((row) => ({ label: row.symbol, value: row.totalPnl }));
}
