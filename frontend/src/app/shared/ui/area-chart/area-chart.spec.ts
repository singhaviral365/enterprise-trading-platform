import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';

import { HIGHCHARTS_LOADER } from '../donut-chart/highcharts-loader';
import { AreaChart, AreaSeries } from './area-chart';

const SERIES: readonly AreaSeries[] = [
  {
    name: 'Holdings',
    tone: 'primary',
    points: [
      { time: Date.UTC(2026, 8, 1), value: 400 },
      { time: Date.UTC(2026, 8, 2), value: 750 },
    ],
  },
  {
    name: 'Cash',
    tone: 'neutral',
    points: [
      { time: Date.UTC(2026, 8, 1), value: 600 },
      { time: Date.UTC(2026, 8, 2), value: 250 },
    ],
  },
];

describe('AreaChart', () => {
  let fixture: ComponentFixture<AreaChart>;
  let root: HTMLElement;
  let chart: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;

  const money = (value: number) => `$${value}`;
  const options = () => chart.mock.calls[0][1] as Options;

  async function render(series: readonly AreaSeries[] = SERIES): Promise<void> {
    fixture.componentRef.setInput('series', series);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
  }

  beforeEach(() => {
    destroy = vi.fn();
    chart = vi.fn(() => ({ destroy }));
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) }],
    });
    fixture = TestBed.createComponent(AreaChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'Cash and holdings over time');
    fixture.componentRef.setInput('valueFormatter', money);
  });

  it('draws a styled-mode area per series, coloured by tone through the colour index', async () => {
    await render();

    const drawn = options();
    expect(drawn.chart).toMatchObject({ type: 'area', styledMode: true });
    const series = drawn.series as { name: string; colorIndex: number; data: unknown }[];
    expect(series.map((s) => [s.name, s.colorIndex])).toEqual([['Holdings', 0], ['Cash', 1]]);
    expect(series[0].data).toEqual([
      [Date.UTC(2026, 8, 1), 400],
      [Date.UTC(2026, 8, 2), 750],
    ]);
  });

  it('stacks the layers only when asked, and starts the axis at zero unless told not to', async () => {
    fixture.componentRef.setInput('stacked', true);
    await render();

    expect(options().plotOptions?.area).toMatchObject({ stacking: 'normal', threshold: 0 });
    expect((options().yAxis as { min: number }).min).toBe(0);
  });

  it('can fit the axis to the data instead of zero', async () => {
    fixture.componentRef.setInput('zeroBased', false);
    await render();

    expect((options().yAxis as { min?: number }).min).toBeUndefined();
    expect(options().plotOptions?.area?.stacking).toBeUndefined();
  });

  it('puts every layer into one shared tooltip with the date', async () => {
    await render();

    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    const text = tooltip.call({
      x: Date.UTC(2026, 8, 1),
      points: [
        { series: { name: 'Holdings' }, y: 400 },
        { series: { name: 'Cash' }, y: 600 },
      ],
    });
    expect(text).toBe('Sep 1, 2026<br/><b>Holdings</b>: $400<br/><b>Cash</b>: $600');
  });

  it('labels the chart image and shows a legend only when asked for', async () => {
    await render();
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Cash and holdings over time');
    expect(root.querySelector('[data-testid="area-chart-legend"]')).toBeNull();

    fixture.componentRef.setInput('legend', true);
    await fixture.whenStable();

    const items = [...root.querySelectorAll('[data-testid="area-chart-legend"] li')].map((li) => li.textContent?.trim());
    expect(items).toEqual(['Holdings', 'Cash']);
  });

  it('draws again when the series change, and destroys the chart with the component', async () => {
    await render();

    fixture.componentRef.setInput('series', [SERIES[0]]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalledTimes(2));
    expect(destroy).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('offers the same numbers as a table, one column per series, newest day first', async () => {
    await render();

    const head = [...root.querySelectorAll('[data-testid="area-chart-table"] thead th')].map((th) => th.textContent?.trim());
    expect(head).toEqual(['Day', 'Holdings', 'Cash']);
    const rows = [...root.querySelectorAll('[data-testid="area-chart-table"] tbody tr')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Sep 2, 2026$750$250', 'Sep 1, 2026$400$600']);
  });
});
