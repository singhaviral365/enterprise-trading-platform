import { NavPoint } from '../../../api/generated/portfolio-performance';

/** What a range of the curve came to. Percentages are percentage points. Null where the range is too short to say. */
export interface RangeStats {
  readonly returnPct: number;
  /** Value change over the range, less money put in after its first day. */
  readonly pnl: number;
  /** Only for a range longer than a year. */
  readonly annualisedPct: number | null;
  /** The worst fall from a peak, negative or zero. */
  readonly maxDrawdownPct: number;
  readonly bestDayPct: number | null;
  readonly worstDayPct: number | null;
}

const DAY_MS = 86_400_000;

export function timeOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * The same figures the server summarises, for whatever range the customer picked, so changing the range needs no request.
 * `points` are closed days, oldest first, and there must be at least one.
 */
export function rangeStats(points: readonly NavPoint[]): RangeStats {
  const first = points[0];
  const last = points[points.length - 1];
  const returnRatio = last.nav / first.nav - 1;

  const flowsAfterStart = points.slice(1).reduce((sum, point) => sum + point.netFlow, 0);
  const pnl = last.value - first.value - flowsAfterStart;

  const days = (timeOf(last.date) - timeOf(first.date)) / DAY_MS;
  const annualisedPct = days > 365 ? (Math.pow(1 + returnRatio, 365 / days) - 1) * 100 : null;

  let peak = first.nav;
  let worstDrawdown = 0;
  let best: number | null = null;
  let worst: number | null = null;
  points.forEach((point, index) => {
    peak = Math.max(peak, point.nav);
    worstDrawdown = Math.min(worstDrawdown, point.nav / peak - 1);
    if (index > 0) {
      const change = point.nav / points[index - 1].nav - 1;
      best = best === null ? change : Math.max(best, change);
      worst = worst === null ? change : Math.min(worst, change);
    }
  });

  return {
    returnPct: returnRatio * 100,
    pnl,
    annualisedPct,
    maxDrawdownPct: worstDrawdown * 100,
    bestDayPct: best === null ? null : best * 100,
    worstDayPct: worst === null ? null : worst * 100,
  };
}

/** A series as percent change from its first point, which is what makes every range start at 0%. */
export function percentFromStart(points: readonly { readonly date: string; readonly nav: number }[]): { time: number; value: number }[] {
  if (points.length === 0) {
    return [];
  }
  const base = points[0].nav;
  return points.map((point) => ({ time: timeOf(point.date), value: (point.nav / base - 1) * 100 }));
}
