import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';
import { DonutChart, DonutSlice } from './donut-chart';
import { HIGHCHARTS_LOADER } from './highcharts-loader';

const SLICES: readonly DonutSlice[] = [
  { name: 'AAPL', detail: 'Apple Inc.', value: 7500 },
  { name: 'MSFT', detail: 'Microsoft Corp.', value: 2500 },
];

describe('DonutChart', () => {
  let fixture: ComponentFixture<DonutChart>;
  let root: HTMLElement;
  let setData: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;
  let chart: ReturnType<typeof vi.fn>;

  const money = (value: number) =>
    `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const options = () => chart.mock.calls[0][1] as Options;

  async function render(slices: readonly DonutSlice[] = SLICES): Promise<void> {
    fixture.componentRef.setInput('slices', slices);
    await fixture.whenStable();
    // the chart library loads asynchronously
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
  }

  beforeEach(() => {
    setData = vi.fn();
    destroy = vi.fn();
    chart = vi.fn(() => ({ series: [{ setData }], destroy }));
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) }],
    });
    fixture = TestBed.createComponent(DonutChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'Investments by cost');
    fixture.componentRef.setInput('valueFormatter', money);
    fixture.componentRef.setInput('centerLabel', 'Invested');
    fixture.componentRef.setInput('centerValue', '$10,000.00');
  });

  it('draws a styled-mode donut, so every colour comes from the CSS tokens', async () => {
    await render();

    const [element, chartOptions] = chart.mock.calls[0] as [HTMLElement, Options];
    expect(element.classList.contains('donut-plot')).toBe(true);
    expect(chartOptions.chart).toMatchObject({ type: 'pie', styledMode: true });
    expect(chartOptions.plotOptions?.pie).toMatchObject({ innerSize: '70%', showInLegend: false });
    expect(chartOptions.legend?.enabled).toBe(false);
    expect(chartOptions.credits?.enabled).toBe(false);
    const series = chartOptions.series?.[0] as {
      data: Array<{ name: string; y: number; colorIndex: number }>;
    };
    expect(series.data).toEqual([
      { name: 'AAPL', y: 7500, colorIndex: 0 },
      { name: 'MSFT', y: 2500, colorIndex: 1 },
    ]);
  });

  it('shows the total in the middle and labels the chart image for assistive tech', async () => {
    await render();

    expect(root.querySelector('[data-testid="donut-center-value"]')?.textContent).toBe(
      '$10,000.00',
    );
    expect(root.querySelector('.donut-center-label')?.textContent).toBe('Invested');
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Investments by cost',
    );
  });

  it('lists every slice in a visually hidden list (name, share, value) for screen readers, not on screen', async () => {
    await render();

    expect(
      root.querySelector('[data-testid="donut-legend"]')?.classList.contains('visually-hidden'),
    ).toBe(true);
    const items = Array.from(root.querySelectorAll('.donut-legend-item'));
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.donut-legend-title')?.textContent).toBe('AAPL');
    expect(items[0].querySelector('.donut-legend-detail')?.textContent).toBe('Apple Inc.');
    expect(items[0].querySelector('.donut-legend-share')?.textContent).toBe('75%');
    expect(items[0].querySelector('.donut-legend-value')?.textContent).toBe('$7,500.00');
  });

  it('cycles through the ten chart colours', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, value: 1 }));
    await render(many);

    const series = options().series?.[0] as { data: Array<{ colorIndex: number }> };
    expect(series.data[9].colorIndex).toBe(9);
    expect(series.data[10].colorIndex).toBe(0);
  });

  it('formats the tooltip with the name, the money and the share', async () => {
    await render();

    const formatter = options().tooltip?.formatter as (this: unknown) => string;
    expect(formatter.call({ name: 'AAPL', y: 7500, percentage: 75 })).toBe(
      '<b>AAPL</b><br/>Apple Inc.<br/>$7,500.00 (75.0%)',
    );
  });

  it('updates the existing chart when the slices change instead of drawing a second one', async () => {
    await render();

    fixture.componentRef.setInput('slices', [{ name: 'TSLA', value: 100 }]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(setData).toHaveBeenCalled());

    expect(chart).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0][0]).toEqual([{ name: 'TSLA', y: 100, colorIndex: 0 }]);
  });

  it('tears the chart down with the component', async () => {
    await render();

    fixture.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
