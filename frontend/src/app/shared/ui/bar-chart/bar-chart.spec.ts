import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';

import { HIGHCHARTS_LOADER } from '../donut-chart/highcharts-loader';
import { BAR_TABLE_ROWS, Bar, BarChart } from './bar-chart';

const CATEGORIES: readonly Bar[] = [
  { label: 'AAPL', value: 120.5 },
  { label: 'GOOG', value: -30 },
];

const DAYS: readonly Bar[] = [
  { time: Date.UTC(2026, 8, 1), value: 10 },
  { time: Date.UTC(2026, 8, 2), value: -4 },
];

describe('BarChart', () => {
  let fixture: ComponentFixture<BarChart>;
  let root: HTMLElement;
  let chart: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;

  const money = (value: number) => `$${value}`;
  const options = (call = 0) => chart.mock.calls[call][1] as Options;

  async function render(bars: readonly Bar[] = CATEGORIES): Promise<void> {
    fixture.componentRef.setInput('bars', bars);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
  }

  beforeEach(() => {
    destroy = vi.fn();
    chart = vi.fn(() => ({ destroy }));
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) }],
    });
    fixture = TestBed.createComponent(BarChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'Profit by instrument');
    fixture.componentRef.setInput('seriesName', 'Profit and loss');
    fixture.componentRef.setInput('valueFormatter', money);
  });

  it('draws horizontal styled-mode bars with the names as categories', async () => {
    fixture.componentRef.setInput('orientation', 'bar');
    await render();

    const drawn = options();
    expect(drawn.chart).toMatchObject({ type: 'bar', styledMode: true });
    expect((drawn.xAxis as { categories: string[] }).categories).toEqual(['AAPL', 'GOOG']);
    expect((drawn.series?.[0] as { data: number[] }).data).toEqual([120.5, -30]);
    expect(drawn.legend?.enabled).toBe(false);
  });

  it('draws one column per day on a date axis, with an optional line over them', async () => {
    fixture.componentRef.setInput('timeAxis', true);
    fixture.componentRef.setInput('line', [{ time: DAYS[0].time!, value: 3 }]);
    await render(DAYS);

    const drawn = options();
    expect(drawn.chart).toMatchObject({ type: 'column' });
    expect((drawn.xAxis as { type: string }).type).toBe('datetime');
    expect(drawn.series).toHaveLength(2);
    expect((drawn.series?.[0] as { data: unknown }).data).toEqual([
      [DAYS[0].time, 10],
      [DAYS[1].time, -4],
    ]);
    expect(drawn.series?.[1]).toMatchObject({ type: 'line', name: 'Total' });
  });

  it('labels the chart image for assistive tech', async () => {
    await render();

    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Profit by instrument');
  });

  it('words the tooltip with the name and the money, and the axis with the money', async () => {
    await render();

    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    expect(tooltip.call({ key: 'AAPL', y: 120.5, series: { name: 'Profit and loss' } })).toBe('AAPL<br/><b>Profit and loss</b>: $120.5');
    const axis = (options().yAxis as { labels: { formatter: (this: unknown) => string } }).labels.formatter;
    expect(axis.call({ value: 50 })).toBe('$50');
  });

  it('draws again, not a second chart on top, when the bars change', async () => {
    await render();

    fixture.componentRef.setInput('bars', [{ label: 'X', value: 1 }]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalledTimes(2));

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the chart with the component', async () => {
    await render();

    fixture.destroy();

    expect(destroy).toHaveBeenCalled();
  });

  it('offers the same numbers as a table, newest day first for a chart over time', async () => {
    fixture.componentRef.setInput('timeAxis', true);
    await render(DAYS);

    const rows = [...root.querySelectorAll('[data-testid="bar-chart-table"] tbody tr')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Sep 2, 2026$-4', 'Sep 1, 2026$10']);
    expect(root.querySelector('[data-testid="bar-chart-table"] summary')?.textContent).toBe('View as table');
  });

  it('lists categories in order and says when the table is cut', async () => {
    const many = Array.from({ length: BAR_TABLE_ROWS + 5 }, (_, i) => ({ label: `S${i}`, value: i }));
    await render(many);

    expect(root.querySelectorAll('[data-testid="bar-chart-table"] tbody tr')).toHaveLength(BAR_TABLE_ROWS);
    expect(root.querySelector('[data-testid="bar-chart-table"] .form-hint')?.textContent).toContain(`${BAR_TABLE_ROWS} most recent of ${many.length}`);
  });
});
