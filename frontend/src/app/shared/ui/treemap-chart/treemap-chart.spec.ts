import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';

import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../donut-chart/highcharts-loader';
import { TreemapChart, TreemapItem, changeBucket } from './treemap-chart';

const ITEMS: readonly TreemapItem[] = [
  { name: 'AAPL', value: 6000, change: 2.5, detail: 'Apple Inc.' },
  { name: 'MSFT', value: 3000, change: -1, detail: null },
  { name: 'GOOG', value: 1000, change: null },
];

describe('changeBucket', () => {
  it('puts a move in one of five steps, and an unknown or flat one in the middle', () => {
    expect([-5, -2, -1, -0.4, 0, null, 0.4, 1, 2, 5].map(changeBucket)).toEqual([0, 0, 1, 2, 2, 2, 2, 3, 4, 4]);
  });
});

describe('TreemapChart', () => {
  let fixture: ComponentFixture<TreemapChart>;
  let root: HTMLElement;
  let chart: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;
  let loadModule: ReturnType<typeof vi.fn>;

  const money = (value: number) => `$${value}`;
  const options = () => chart.mock.calls[0][1] as Options;

  async function render(items: readonly TreemapItem[] = ITEMS): Promise<void> {
    fixture.componentRef.setInput('items', items);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
  }

  beforeEach(() => {
    destroy = vi.fn();
    chart = vi.fn(() => ({ destroy }));
    loadModule = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) },
        { provide: HIGHCHARTS_MODULE_LOADER, useValue: loadModule },
      ],
    });
    fixture = TestBed.createComponent(TreemapChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'Your holdings by value and move');
    fixture.componentRef.setInput('valueFormatter', money);
    fixture.componentRef.setInput('valueName', 'Market value');
    fixture.componentRef.setInput('changeName', 'Today');
  });

  it('loads the treemap module before drawing, and draws a block per item sized by value and coloured by its move', async () => {
    await render();

    expect(loadModule).toHaveBeenCalledWith('treemap');
    const series = options().series?.[0] as { type: string; data: { name: string; value: number; colorIndex: number }[] };
    expect(series.type).toBe('treemap');
    expect(series.data.map((d) => [d.name, d.value, d.colorIndex])).toEqual([
      ['AAPL', 6000, 4],
      ['MSFT', 3000, 1],
      ['GOOG', 1000, 2],
    ]);
    expect(options().chart?.styledMode).toBe(true);
  });

  it('says the name and the change on each block in text, so colour is never the only signal', async () => {
    await render();

    const series = options().series?.[0] as { dataLabels: { formatter: (this: unknown) => string } };
    expect(series.dataLabels.formatter.call({ point: { name: 'AAPL' } })).toBe('AAPL\n+2.50%');
    expect(series.dataLabels.formatter.call({ point: { name: 'GOOG' } })).toBe('GOOG\nn/a');
  });

  it('words the tooltip with the name, the detail, the value and the move', async () => {
    await render();

    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    expect(tooltip.call({ key: 'AAPL', point: { name: 'AAPL', value: 6000 } })).toBe(
      '<b>AAPL</b><br/>Apple Inc.<br/>Market value: $6000<br/>Today: +2.50%',
    );
  });

  it('labels the chart image for assistive tech', async () => {
    await render();

    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Your holdings by value and move');
  });

  it('offers the same numbers as a table', async () => {
    await render();

    const rows = [...root.querySelectorAll('[data-testid="treemap-chart-table"] tbody tr')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['AAPL$6000+2.50%', 'MSFT$3000-1.00%', 'GOOG$1000n/a']);
    const head = [...root.querySelectorAll('[data-testid="treemap-chart-table"] thead th')].map((th) => th.textContent?.trim());
    expect(head).toEqual(['Name', 'Market value', 'Today']);
  });

  it('draws again when the items change, and destroys the chart with the component', async () => {
    await render();

    fixture.componentRef.setInput('items', [ITEMS[0]]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalledTimes(2));
    expect(destroy).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });
});
