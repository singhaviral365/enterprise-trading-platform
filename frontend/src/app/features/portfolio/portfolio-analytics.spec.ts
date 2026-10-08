import { NavPoint } from '../../api/generated/portfolio-performance';
import {
  allocationSlices,
  biggestMover,
  contributionBars,
  dailyPnlBars,
  drawdownSeries,
  hasValueSplit,
  investedShare,
  monthBucket,
  monthlyReturns,
  pricedHoldings,
  realisedCumulative,
  topShare,
  treemapItems,
  valueLayers,
} from './portfolio-analytics';
import { PositionRow } from './position-row';

function nav(date: string, navValue: number, extra: Partial<NavPoint> = {}): NavPoint {
  return {
    date,
    nav: navValue,
    value: 1000,
    netFlow: 0,
    dayPnl: 0,
    unrealisedPnl: 0,
    realisedPnlCumulative: 0,
    estimated: false,
    ...extra,
  };
}

function row(symbol: string, marketValue: number | null, over: Partial<PositionRow> = {}, dayPct: number | null = 1): PositionRow {
  return {
    symbol,
    name: `${symbol} Inc.`,
    iconUrl: null,
    quoteCurrency: 'USD',
    quantity: 1,
    averageCost: 1,
    costBasis: 1,
    pricing:
      marketValue === null
        ? null
        : {
            status: 'live',
            lastPrice: marketValue,
            marketValue,
            unrealisedPnl: 0,
            unrealisedPercent: 0,
            dayPnl: dayPct === null ? null : marketValue * (dayPct / 100),
            dayPnlPercent: dayPct,
            priceAsOf: null,
          },
    ...over,
  };
}

describe('drawdown', () => {
  it('is zero at every new high and negative below the previous peak, in percent', () => {
    const series = drawdownSeries([nav('2026-09-01', 1000), nav('2026-09-02', 1100), nav('2026-09-03', 990), nav('2026-09-04', 1210)]);

    expect(series.map((p) => Number(p.value.toFixed(2)))).toEqual([0, 0, -10, 0]);
    expect(series[0].time).toBe(Date.UTC(2026, 8, 1));
  });

  it('measures the NAV, so a deposit never looks like a recovery', () => {
    const series = drawdownSeries([nav('2026-09-01', 1000, { value: 1000 }), nav('2026-09-02', 900, { value: 5000, netFlow: 4100 })]);

    expect(series[1].value).toBeCloseTo(-10, 5);
  });
});

describe('daily columns and the realised line', () => {
  const points = [nav('2026-09-01', 1000, { dayPnl: 5, realisedPnlCumulative: 0 }), nav('2026-09-02', 1001, { dayPnl: -3, realisedPnlCumulative: 12 })];

  it('has one column per day with that day profit or loss', () => {
    expect(dailyPnlBars(points)).toEqual([
      { time: Date.UTC(2026, 8, 1), value: 5 },
      { time: Date.UTC(2026, 8, 2), value: -3 },
    ]);
  });

  it('gives the realised total so far for the line', () => {
    expect(realisedCumulative(points).map((p) => p.value)).toEqual([0, 12]);
  });
});

describe('cash and holdings', () => {
  it('knows whether the server sent the split, and tolerates a server that did not', () => {
    expect(hasValueSplit([])).toBe(false);
    expect(hasValueSplit([nav('2026-09-01', 1000)])).toBe(false);
    expect(hasValueSplit([nav('2026-09-01', 1000, { cash: 1, holdingsValue: 2 })])).toBe(true);
    expect(investedShare([nav('2026-09-01', 1000)])).toBeNull();
  });

  it('splits the value into two layers and works out the invested share on the last day', () => {
    const points = [nav('2026-09-01', 1000, { cash: 600, holdingsValue: 400, value: 1000 }), nav('2026-09-02', 1000, { cash: 250, holdingsValue: 750, value: 1000 })];

    const layers = valueLayers(points);
    expect(layers.holdings.map((p) => p.value)).toEqual([400, 750]);
    expect(layers.cash.map((p) => p.value)).toEqual([600, 250]);
    expect(investedShare(points)).toBe(75);
  });
});

describe('monthly returns', () => {
  it('has nothing to say before there are two days', () => {
    expect(monthlyReturns([nav('2026-09-01', 1000)])).toEqual([]);
  });

  it('measures each month against the previous month end, and marks the first and an unfinished month partial', () => {
    const months = monthlyReturns([
      nav('2026-08-20', 1000),
      nav('2026-08-31', 1100),
      nav('2026-09-15', 1000),
      nav('2026-09-30', 1210),
      nav('2026-10-05', 1089),
    ]);

    expect(months).toHaveLength(3);
    expect(months[0]).toMatchObject({ year: 2026, month: 7, partial: true });
    expect(months[0].returnPct).toBeCloseTo(10, 5);
    expect(months[1]).toMatchObject({ month: 8, partial: false });
    expect(months[1].returnPct).toBeCloseTo(10, 5);
    expect(months[2]).toMatchObject({ month: 9, partial: true });
    expect(months[2].returnPct).toBeCloseTo(-10, 5);
  });

  it('skips a first month that holds only the first day', () => {
    const months = monthlyReturns([nav('2026-08-31', 1000), nav('2026-09-30', 1050)]);

    expect(months.map((m) => m.month)).toEqual([8]);
    expect(months[0].returnPct).toBeCloseTo(5, 5);
  });

  it('puts a month in one of five colour steps', () => {
    expect([-5, -1, 0.1, 1, 5].map(monthBucket)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('allocation, concentration and movers', () => {
  const rows = [row('AAPL', 6000), row('MSFT', 3000, { quoteCurrency: 'EUR' }), row('GOOG', 1000), row('NOPRICE', null)];

  it('lists only priced holdings, biggest first', () => {
    expect(pricedHoldings(rows).map((r) => r.symbol)).toEqual(['AAPL', 'MSFT', 'GOOG']);
  });

  it('draws one slice per instrument, or one per currency the instruments are quoted in', () => {
    expect(allocationSlices(rows, 'instrument', 'USD').map((s) => [s.name, s.value])).toEqual([
      ['AAPL', 6000],
      ['MSFT', 3000],
      ['GOOG', 1000],
    ]);
    expect(allocationSlices(rows, 'currency', 'USD').map((s) => [s.name, s.value])).toEqual([
      ['USD', 7000],
      ['EUR', 3000],
    ]);
  });

  it('falls back to the account currency for a holding that does not say', () => {
    expect(allocationSlices([row('X', 10, { quoteCurrency: null })], 'currency', 'GBP').map((s) => s.name)).toEqual(['GBP']);
  });

  it('works out what the biggest holdings add up to, as a share', () => {
    expect(topShare(rows, 1)).toBe(60);
    expect(topShare(rows, 3)).toBe(100);
    expect(topShare([row('A', null)], 3)).toBeNull();
  });

  it('turns priced holdings into treemap blocks sized by value and coloured by the day move', () => {
    expect(treemapItems(rows)[0]).toMatchObject({ name: 'AAPL', value: 6000, change: 1, detail: 'AAPL Inc.' });
  });

  it('names the holding that moved the most money today in either direction', () => {
    const mover = biggestMover([row('AAPL', 6000, {}, 1), row('GOOG', 1000, {}, -20), row('GAP', 500, {}, null)]);

    // GOOG fell 20% of 1,000: a bigger move in money than AAPL's rise of 1% of 6,000.
    expect(mover).toMatchObject({ symbol: 'GOOG', dayPnl: -200 });
    expect(biggestMover([row('A', null)])).toBeNull();
  });
});

describe('contribution bars', () => {
  it('sorts who made and who lost the money, best first', () => {
    const bars = contributionBars([
      { symbol: 'B', realisedPnl: 0, unrealisedPnl: -5, totalPnl: -5 },
      { symbol: 'A', realisedPnl: 10, unrealisedPnl: 5, totalPnl: 15 },
    ]);

    expect(bars).toEqual([
      { label: 'A', value: 15 },
      { label: 'B', value: -5 },
    ]);
  });
});
