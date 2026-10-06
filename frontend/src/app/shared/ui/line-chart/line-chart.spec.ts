import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';
import { HIGHCHARTS_LOADER } from '../donut-chart/highcharts-loader';
import { LineChart, LinePoint } from './line-chart';

const POINTS: readonly LinePoint[] = [
  { time: Date.UTC(2026, 8, 1), value: 1000 },
  { time: Date.UTC(2026, 8, 10), value: 500 },
];

describe('LineChart', () => {
  let fixture: ComponentFixture<LineChart>;
  let root: HTMLElement;
  let setData: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;
  let chart: ReturnType<typeof vi.fn>;

  const money = (value: number) => `$${value}`;
  const options = () => chart.mock.calls[0][1] as Options;

  async function render(points: readonly LinePoint[] = POINTS): Promise<void> {
    fixture.componentRef.setInput('points', points);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
  }

  beforeEach(() => {
    setData = vi.fn();
    destroy = vi.fn();
    chart = vi.fn(() => ({ series: [{ setData }], destroy }));
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) }],
    });
    fixture = TestBed.createComponent(LineChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'Invested over time');
    fixture.componentRef.setInput('seriesName', 'Invested at cost');
    fixture.componentRef.setInput('valueFormatter', money);
  });

  it('draws a stepped, styled-mode area chart on a time axis, so every colour comes from the CSS tokens', async () => {
    await render();

    const [element, chartOptions] = chart.mock.calls[0] as [HTMLElement, Options];
    expect(element.classList.contains('line-plot')).toBe(true);
    expect(chartOptions.chart).toMatchObject({ type: 'area', styledMode: true });
    expect((chartOptions.xAxis as { type: string }).type).toBe('datetime');
    expect(chartOptions.plotOptions?.area).toMatchObject({ step: 'left' });
    expect(chartOptions.legend?.enabled).toBe(false);
    const series = chartOptions.series?.[0] as { data: Array<[number, number]> };
    expect(series.data).toEqual([
      [POINTS[0].time, 1000],
      [POINTS[1].time, 500],
    ]);
  });

  it('labels the chart image for assistive tech', async () => {
    await render();

    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Invested over time',
    );
  });

  it('formats the tooltip with the date (in the chosen date format), the series name and the money, and the axis with the money', async () => {
    await render();

    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    expect(tooltip.call({ x: Date.UTC(2026, 8, 1), y: 1000 })).toMatch(
      /^Sep 1, 2026<br\/><b>Invested at cost<\/b>: \$1000$/,
    );
    const axis = (options().yAxis as { labels: { formatter: (this: unknown) => string } }).labels
      .formatter;
    expect(axis.call({ value: 250 })).toBe('$250');
  });

  it('updates the existing chart when the points change instead of drawing a second one', async () => {
    await render();

    fixture.componentRef.setInput('points', [{ time: 1, value: 5 }]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(setData).toHaveBeenCalled());

    expect(chart).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0][0]).toEqual([[1, 5]]);
  });

  it('tears the chart down with the component', async () => {
    await render();

    fixture.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
