import { NavPoint } from '../../../api/generated/portfolio-performance';
import { percentFromStart, rangeStats, timeOf } from './performance-stats';

const point = (date: string, nav: number, value: number, netFlow = 0): NavPoint => ({
  date,
  nav,
  value,
  netFlow,
  dayPnl: 0,
  unrealisedPnl: 0,
  realisedPnlCumulative: 0,
  estimated: false,
});

describe('rangeStats', () => {
  it('returns the nav change and the profit, which is the value change less money put in', () => {
    const stats = rangeStats([
      point('2026-09-01', 1000, 10000, 10000),
      point('2026-09-02', 1000, 15000, 5000),
      point('2026-09-03', 1066.666667, 16000),
    ]);

    expect(stats.returnPct).toBeCloseTo(6.6667, 3);
    expect(stats.pnl).toBe(1000);
    expect(stats.annualisedPct).toBeNull();
  });

  it('finds the worst fall from a peak and the best and worst single day', () => {
    const stats = rangeStats([
      point('2026-09-01', 1000, 1),
      point('2026-09-02', 1100, 1),
      point('2026-09-03', 990, 1),
      point('2026-09-04', 1050, 1),
    ]);

    expect(stats.maxDrawdownPct).toBeCloseTo(-10, 6);
    expect(stats.bestDayPct).toBeCloseTo(10, 6);
    expect(stats.worstDayPct).toBeCloseTo(-10, 6);
  });

  it('annualises only a range longer than a year', () => {
    const stats = rangeStats([point('2024-01-01', 1000, 1), point('2026-01-01', 1210, 1)]);

    expect(stats.returnPct).toBeCloseTo(21, 6);
    expect(stats.annualisedPct).toBeCloseTo(10, 0);
  });

  it('has no best or worst day for a single day', () => {
    const stats = rangeStats([point('2026-09-01', 1000, 1)]);

    expect(stats.returnPct).toBe(0);
    expect(stats.bestDayPct).toBeNull();
    expect(stats.worstDayPct).toBeNull();
    expect(stats.maxDrawdownPct).toBe(0);
  });
});

describe('percentFromStart', () => {
  it('starts every series at 0 per cent', () => {
    const series = percentFromStart([
      { date: '2026-09-01', nav: 500 },
      { date: '2026-09-02', nav: 550 },
    ]);

    expect(series.map((p) => p.value)).toEqual([0, expect.closeTo(10, 6)]);
    expect(series[0].time).toBe(timeOf('2026-09-01'));
  });

  it('is empty for no points', () => {
    expect(percentFromStart([])).toEqual([]);
  });
});
