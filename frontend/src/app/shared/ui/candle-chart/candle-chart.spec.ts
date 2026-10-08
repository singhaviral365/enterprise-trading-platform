import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';

import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../donut-chart/highcharts-loader';
import { CANDLE_TABLE_ROWS, Candle, CandleChart, TradeMarker } from './candle-chart';

const CANDLES: readonly Candle[] = [
  { time: Date.UTC(2026, 8, 1), open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: Date.UTC(2026, 8, 2), open: 11, high: 13, low: 10, close: 12, volume: null },
];

const TRADES: readonly TradeMarker[] = [
  { time: Date.UTC(2026, 8, 1), price: 10.5, side: 'BUY', quantity: 5 },
  { time: Date.UTC(2026, 8, 2), price: 12, side: 'SELL', quantity: 2 },
];

describe('CandleChart', () => {
  let fixture: ComponentFixture<CandleChart>;
  let root: HTMLElement;
  let chart: ReturnType<typeof vi.fn>;
  let stockChart: ReturnType<typeof vi.fn>;
  let destroy: ReturnType<typeof vi.fn>;
  let loadModule: ReturnType<typeof vi.fn>;

  const money = (value: number) => `$${value}`;
  const options = () => stockChart.mock.calls[0][1] as Options;

  async function render(candles: readonly Candle[] = CANDLES): Promise<void> {
    fixture.componentRef.setInput('candles', candles);
    await fixture.whenStable();
    await vi.waitFor(() => expect(stockChart).toHaveBeenCalled());
  }

  beforeEach(() => {
    destroy = vi.fn();
    chart = vi.fn(() => ({ destroy }));
    stockChart = vi.fn(() => ({ destroy }));
    loadModule = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart, stockChart }) },
        { provide: HIGHCHARTS_MODULE_LOADER, useValue: loadModule },
      ],
    });
    fixture = TestBed.createComponent(CandleChart);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('ariaLabel', 'AAPL candles');
    fixture.componentRef.setInput('valueFormatter', money);
  });

  it('loads the stock module and draws candles in the top pane with volume under them', async () => {
    await render();

    expect(loadModule).toHaveBeenCalledWith('stock');
    const drawn = options();
    expect(drawn.chart?.styledMode).toBe(true);
    const series = drawn.series as { type: string; data: unknown[] }[];
    expect(series.map((s) => s.type)).toEqual(['candlestick', 'column', 'scatter']);
    expect(series[0].data).toEqual([
      [CANDLES[0].time, 10, 12, 9, 11],
      [CANDLES[1].time, 11, 13, 10, 12],
    ]);
    // A day with no volume is left out of the volume pane.
    expect(series[1].data).toEqual([[CANDLES[0].time, 100]]);
    expect((drawn.yAxis as { height?: string }[])[0].height).toBe('75%');
  });

  it('draws the customers average cost as a dashed line with its value in words', async () => {
    fixture.componentRef.setInput('averageCost', 10.25);
    await render();

    const line = ((options().yAxis as { plotLines: { value: number; className: string; label: { text: string } }[] }[])[0]).plotLines[0];
    expect(line).toMatchObject({ value: 10.25, className: 'candle-average-cost' });
    expect(line.label.text).toBe('Your average cost $10.25');
  });

  it('draws no cost line without a cost', async () => {
    await render();

    expect((options().yAxis as { plotLines: unknown[] }[])[0].plotLines).toEqual([]);
  });

  it('marks buys with an up triangle and sells with a down triangle, and says what each was', async () => {
    fixture.componentRef.setInput('trades', TRADES);
    await render();

    const markers = (options().series as { type: string; data: { className: string; marker: { symbol: string }; custom: { label: string } }[] }[])[2].data;
    expect(markers.map((m) => [m.className, m.marker.symbol])).toEqual([
      ['candle-buy', 'triangle'],
      ['candle-sell', 'triangle-down'],
    ]);
    expect(markers[0].custom.label).toBe('Bought 5 at $10.5');
    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    expect(tooltip.call({ x: CANDLES[0].time, point: markers[0] })).toBe('Sep 1, 2026<br/><b>Bought 5 at $10.5</b>');
  });

  it('words a candle tooltip with all four prices', async () => {
    await render();

    const tooltip = options().tooltip?.formatter as (this: unknown) => string;
    expect(tooltip.call({ x: CANDLES[0].time, point: { open: 10, high: 12, low: 9, close: 11 } })).toBe(
      'Sep 1, 2026<br/>Open: $10<br/>High: $12<br/>Low: $9<br/>Close: $11',
    );
  });

  it('labels the chart image for assistive tech', async () => {
    await render();

    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('AAPL candles');
  });

  it('offers the latest days and the trades as text', async () => {
    fixture.componentRef.setInput('trades', TRADES);
    await render();

    const rows = [...root.querySelectorAll('[data-testid="candle-chart-table"] tbody tr')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Sep 2, 2026$11$13$10$12', 'Sep 1, 2026$10$12$9$11']);
    const trades = [...root.querySelectorAll('[data-testid="candle-chart-trades"] li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(trades).toEqual(['Sep 2, 2026: Sold 2 at $12', 'Sep 1, 2026: Bought 5 at $10.5']);
  });

  it('cuts the table to the latest days and says so', async () => {
    const many = Array.from({ length: CANDLE_TABLE_ROWS + 4 }, (_, i) => ({ ...CANDLES[0], time: Date.UTC(2026, 0, 1 + i) }));
    await render(many);

    expect(root.querySelectorAll('[data-testid="candle-chart-table"] tbody tr')).toHaveLength(CANDLE_TABLE_ROWS);
    expect(root.querySelector('[data-testid="candle-chart-table"] .form-hint')?.textContent).toContain(`${CANDLE_TABLE_ROWS} days`);
  });

  it('falls back to a plain chart where there is no stock chart, and destroys the chart with the component', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) },
        { provide: HIGHCHARTS_MODULE_LOADER, useValue: loadModule },
      ],
    });
    fixture = TestBed.createComponent(CandleChart);
    fixture.componentRef.setInput('ariaLabel', 'x');
    fixture.componentRef.setInput('candles', CANDLES);
    await fixture.whenStable();
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());

    fixture.destroy();
    expect(destroy).toHaveBeenCalled();
  });
});
