import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { formatDate } from '@angular/common';
import type { Chart, Options } from 'highcharts';

import { FormatPreferences } from '../../../core/format-preferences';
import { resolveDatePattern } from '../../../core/preferences';
import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../donut-chart/highcharts-loader';

/** What a tooltip's point carries for a candle, or for one of the trade markers (their text is in `custom`). */
interface CandlePoint {
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly close?: number;
  readonly custom?: { readonly label?: string };
}

/** One daily candle. Prices and the volume may be missing for a day the market was closed. */
export interface Candle {
  /** Epoch milliseconds (midnight UTC of the day). */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
}

/** One of the customer's own buys or sells, drawn over the candles. */
export interface TradeMarker {
  readonly time: number;
  readonly price: number;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: number;
}

/** How many days "View as table" shows before it says there are more. */
export const CANDLE_TABLE_ROWS = 30;

/**
 * Candlestick chart with volume (Highcharts stock module, lazy, styled mode) for one instrument over the past year, with two things
 * that make it the customer's own: **their average cost as a dashed line** and **their buys and sells as markers** (an up triangle for a
 * buy, a down triangle for a sell), so "where did I buy relative to the price action" is one glance.
 *
 * Up days and down days are told apart by fill (solid or hollow) as well as colour, and "View as table" lists the latest days.
 */
@Component({
  selector: 'app-candle-chart',
  templateUrl: './candle-chart.html',
  styleUrl: './candle-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class CandleChart {
  readonly candles = input.required<readonly Candle[]>();
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  /** The customer's average cost per unit, drawn as a dashed line; null for none. */
  readonly averageCost = input<number | null>(null);
  readonly trades = input<readonly TradeMarker[]>([]);
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));
  readonly height = input(320);

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly loadModule = inject(HIGHCHARTS_MODULE_LOADER);
  private readonly formats = inject(FormatPreferences);
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  private chart: Chart | null = null;
  private destroyed = false;

  protected readonly rows = computed(() => [...this.candles()].reverse().slice(0, CANDLE_TABLE_ROWS));
  protected readonly hiddenRows = computed(() => Math.max(0, this.candles().length - CANDLE_TABLE_ROWS));
  protected readonly tradesNewestFirst = computed(() => [...this.trades()].sort((a, b) => b.time - a.time));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const element = this.plot().nativeElement;
      void this.draw(element, this.candles(), this.averageCost(), this.trades());
    });
  }

  protected formatTime(time: number): string {
    const pattern = resolveDatePattern('mediumDate', this.formats.dateFormat(), this.formats.timeFormat()) ?? 'mediumDate';
    return formatDate(time, pattern, 'en-US', 'UTC');
  }

  private async draw(
    element: HTMLElement,
    candles: readonly Candle[],
    averageCost: number | null,
    trades: readonly TradeMarker[],
  ): Promise<void> {
    const highcharts = await this.loadHighcharts();
    await this.loadModule('stock');
    if (this.destroyed) {
      return;
    }
    this.chart?.destroy();
    const formatValue = (value: number) => this.valueFormatter()(value);
    const formats = this.formats;
    const animate = !prefersReducedMotion();
    const pattern = () => resolveDatePattern('mediumDate', formats.dateFormat(), formats.timeFormat()) ?? 'mediumDate';
    const priced = candles.length > 0;
    const options: Options = {
      chart: { styledMode: true, animation: animate, spacing: [8, 8, 4, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      rangeSelector: { enabled: false },
      navigator: { enabled: false },
      scrollbar: { enabled: false },
      xAxis: { type: 'datetime', crosshair: true, tickPixelInterval: 120 },
      yAxis: [
        {
          height: '75%',
          title: { text: undefined },
          tickAmount: 5,
          labels: {
            x: -8,
            formatter() {
              return formatValue(Number(this.value));
            },
          },
          plotLines:
            averageCost !== null && priced
              ? [
                  {
                    value: averageCost,
                    width: 2,
                    zIndex: 5,
                    className: 'candle-average-cost',
                    label: { text: `Your average cost ${formatValue(averageCost)}`, align: 'left', x: 6, y: -4 },
                  },
                ]
              : [],
        },
        {
          top: '80%',
          height: '20%',
          offset: 0,
          title: { text: undefined },
          labels: { enabled: false },
          gridLineWidth: 0,
        },
      ],
      tooltip: {
        formatter() {
          const date = formatDate(Number(this.x), pattern(), 'en-US', 'UTC');
          const point = (this as unknown as { point?: CandlePoint }).point ?? (this as unknown as CandlePoint);
          if (point.custom?.label) {
            return `${date}<br/><b>${point.custom.label}</b>`;
          }
          if (point.close !== undefined) {
            return (
              `${date}<br/>Open: ${formatValue(point.open ?? 0)}<br/>High: ${formatValue(point.high ?? 0)}` +
              `<br/>Low: ${formatValue(point.low ?? 0)}<br/>Close: ${formatValue(point.close)}`
            );
          }
          return `${date}<br/><b>${this.series?.name ?? ''}</b>: ${Number(this.y ?? 0).toLocaleString()}`;
        },
      },
      plotOptions: {
        candlestick: { animation: animate },
        column: { animation: animate, borderWidth: 0 },
      },
      series: [
        {
          type: 'candlestick',
          name: 'Price',
          id: 'price',
          data: candles.map((c) => [c.time, c.open, c.high, c.low, c.close]),
        },
        {
          type: 'column',
          name: 'Volume',
          yAxis: 1,
          data: candles.filter((c) => c.volume !== null).map((c) => [c.time, c.volume ?? 0]),
        },
        {
          type: 'scatter',
          name: 'Your trades',
          className: 'candle-trades',
          data: trades.map((trade) => ({
            x: trade.time,
            y: trade.price,
            className: trade.side === 'BUY' ? 'candle-buy' : 'candle-sell',
            marker: { symbol: trade.side === 'BUY' ? 'triangle' : 'triangle-down', radius: 7 },
            custom: {
              label: `${trade.side === 'BUY' ? 'Bought' : 'Sold'} ${trade.quantity} at ${formatValue(trade.price)}`,
            },
          })),
        },
      ],
    };
    this.chart = (highcharts as unknown as { stockChart: (el: HTMLElement, o: Options) => Chart }).stockChart
      ? (highcharts as unknown as { stockChart: (el: HTMLElement, o: Options) => Chart }).stockChart(element, options)
      : highcharts.chart(element, options);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
