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
import { HIGHCHARTS_LOADER } from '../donut-chart/highcharts-loader';
import type { LinePoint } from '../line-chart/line-chart';

/** One bar: a label (for a category chart) or a time (for a chart over time), and a signed value. */
export interface Bar {
  readonly label?: string;
  readonly time?: number;
  readonly value: number;
}

/** How many rows "View as table" shows before it says there are more. */
export const BAR_TABLE_ROWS = 60;

/**
 * Bar or column chart (Highcharts, lazy, styled mode) where the sign is the story: a bar above zero is a gain (success token), a bar
 * below it a loss (error token), so colour never stands alone: the axis, the tooltip and "View as table" carry the numbers.
 *
 * `orientation="bar"` draws horizontal bars for labelled categories (who made and who lost the money); `"column"` with `timeAxis` draws
 * one column per day. An optional line (for instance a running total) is drawn over the columns on the same axis.
 */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class BarChart {
  readonly bars = input.required<readonly Bar[]>();
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  readonly orientation = input<'column' | 'bar'>('column');
  /** Bars carry a `time` and the x axis is a date axis. */
  readonly timeAxis = input(false);
  readonly seriesName = input('Value');
  /** Formats a value for the tooltip, the table and the value axis. */
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));
  readonly axisFormatter = input<((value: number) => string) | null>(null);
  /** An optional line over the columns, on the same axis (a running total). */
  readonly line = input<readonly LinePoint[] | null>(null);
  readonly lineName = input('Total');
  /** Height of the plot in pixels. */
  readonly height = input(260);

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly formats = inject(FormatPreferences);
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  private chart: Chart | null = null;
  private destroyed = false;

  /** The rows of "View as table": the newest first for a chart over time. */
  protected readonly rows = computed(() => {
    const all = this.bars().map((bar) => ({
      label: bar.label ?? '',
      time: bar.time ?? null,
      value: bar.value,
    }));
    const ordered = this.timeAxis() ? [...all].reverse() : all;
    return ordered.slice(0, BAR_TABLE_ROWS);
  });
  protected readonly hiddenRows = computed(() => Math.max(0, this.bars().length - BAR_TABLE_ROWS));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const element = this.plot().nativeElement;
      void this.draw(element, this.bars(), this.line());
    });
  }

  protected formatTime(time: number | null): string {
    if (time === null) {
      return '';
    }
    const pattern = resolveDatePattern('mediumDate', this.formats.dateFormat(), this.formats.timeFormat()) ?? 'mediumDate';
    return formatDate(time, pattern, 'en-US', 'UTC');
  }

  private async draw(element: HTMLElement, bars: readonly Bar[], line: readonly LinePoint[] | null): Promise<void> {
    const highcharts = await this.loadHighcharts();
    if (this.destroyed) {
      return;
    }
    this.chart?.destroy();
    const formatValue = (value: number) => this.valueFormatter()(value);
    const formatAxis = (value: number) => (this.axisFormatter() ?? this.valueFormatter())(value);
    const timeAxis = this.timeAxis();
    const horizontal = this.orientation() === 'bar';
    const name = this.seriesName();
    const lineName = this.lineName();
    const formats = this.formats;
    const animate = !prefersReducedMotion();
    const data = timeAxis
      ? bars.map((bar) => [bar.time ?? 0, bar.value] as [number, number])
      : bars.map((bar) => bar.value);
    const options: Options = {
      chart: { type: horizontal ? 'bar' : 'column', styledMode: true, animation: animate, spacing: [8, 8, 4, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: timeAxis
        ? { type: 'datetime', crosshair: true, tickPixelInterval: 120 }
        : { categories: bars.map((bar) => bar.label ?? ''), crosshair: true, title: { text: undefined } },
      yAxis: {
        title: { text: undefined },
        tickAmount: 5,
        labels: {
          formatter() {
            return formatAxis(Number(this.value));
          },
        },
      },
      tooltip: {
        formatter() {
          const where = timeAxis
            ? formatDate(Number(this.x), resolveDatePattern('mediumDate', formats.dateFormat(), formats.timeFormat()) ?? 'mediumDate', 'en-US', 'UTC')
            : String(this.key ?? this.x ?? '');
          return `${where}<br/><b>${this.series?.name ?? name}</b>: ${formatValue(this.y ?? 0)}`;
        },
      },
      plotOptions: {
        column: { borderWidth: 0, pointPadding: 0.08, groupPadding: 0.06, animation: animate },
        bar: { borderWidth: 0, pointPadding: 0.12, groupPadding: 0.06, animation: animate },
        line: { marker: { enabled: false }, animation: animate },
      },
      series: [
        { type: horizontal ? 'bar' : 'column', name, data },
        ...(line && line.length && !horizontal
          ? [{ type: 'line' as const, name: lineName, data: line.map((point) => [point.time, point.value] as [number, number]) }]
          : []),
      ],
    };
    this.chart = highcharts.chart(element, options);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
