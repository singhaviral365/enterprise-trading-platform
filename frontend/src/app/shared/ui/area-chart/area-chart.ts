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

/** What a series means, which decides its colour: your own money, the part that is not working, a good thing, a bad thing. */
export type AreaTone = 'primary' | 'neutral' | 'success' | 'loss';

export interface AreaSeries {
  readonly name: string;
  readonly points: readonly LinePoint[];
  readonly tone: AreaTone;
}

const TONE_INDEX: Readonly<Record<AreaTone, number>> = { primary: 0, neutral: 1, success: 2, loss: 3 };

/** How many rows "View as table" shows before it says there are more. */
export const AREA_TABLE_ROWS = 60;

/**
 * Area chart over time (Highcharts, lazy, styled mode) for one or more series, stacked or not: cash against holdings over time, or how
 * far below its peak the account has been. Colours come from the tones through `area-chart.css`, never from TypeScript, and a
 * legend-free chart is described by its label, its tooltip and "View as table".
 */
@Component({
  selector: 'app-area-chart',
  templateUrl: './area-chart.html',
  styleUrl: './area-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class AreaChart {
  readonly series = input.required<readonly AreaSeries[]>();
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  /** Stack the series on top of one another (they add up to the whole). */
  readonly stacked = input(false);
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));
  readonly axisFormatter = input<((value: number) => string) | null>(null);
  /** Start the value axis at 0; false fits it to the data. */
  readonly zeroBased = input(true);
  /** Show a legend of the series names (useful when there is more than one). */
  readonly legend = input(false);
  readonly height = input(260);

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly formats = inject(FormatPreferences);
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  private chart: Chart | null = null;
  private destroyed = false;

  /** Newest day first, one column per series. Days a series lacks are left blank. */
  protected readonly tableRows = computed(() => {
    const series = this.series();
    const times = new Set<number>();
    series.forEach((s) => s.points.forEach((point) => times.add(point.time)));
    const lookups = series.map((s) => new Map(s.points.map((point) => [point.time, point.value])));
    return [...times]
      .sort((a, b) => b - a)
      .slice(0, AREA_TABLE_ROWS)
      .map((time) => ({ time, values: lookups.map((lookup) => lookup.get(time) ?? null) }));
  });
  protected readonly hiddenRows = computed(() => {
    const times = new Set<number>();
    this.series().forEach((s) => s.points.forEach((point) => times.add(point.time)));
    return Math.max(0, times.size - AREA_TABLE_ROWS);
  });
  protected readonly legendItems = computed(() => this.series().map((s) => ({ name: s.name, tone: s.tone })));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const element = this.plot().nativeElement;
      void this.draw(element, this.series());
    });
  }

  protected formatTime(time: number): string {
    const pattern = resolveDatePattern('mediumDate', this.formats.dateFormat(), this.formats.timeFormat()) ?? 'mediumDate';
    return formatDate(time, pattern, 'en-US', 'UTC');
  }

  private async draw(element: HTMLElement, series: readonly AreaSeries[]): Promise<void> {
    const highcharts = await this.loadHighcharts();
    if (this.destroyed) {
      return;
    }
    this.chart?.destroy();
    const formatValue = (value: number) => this.valueFormatter()(value);
    const formatAxis = (value: number) => (this.axisFormatter() ?? this.valueFormatter())(value);
    const formats = this.formats;
    const stacked = this.stacked();
    const animate = !prefersReducedMotion();
    const options: Options = {
      chart: { type: 'area', styledMode: true, animation: animate, spacing: [8, 8, 4, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: { type: 'datetime', crosshair: true, tickPixelInterval: 120 },
      yAxis: {
        title: { text: undefined },
        min: this.zeroBased() ? 0 : undefined,
        tickAmount: 5,
        labels: {
          formatter() {
            return formatAxis(Number(this.value));
          },
        },
      },
      tooltip: {
        shared: true,
        formatter() {
          const pattern = resolveDatePattern('mediumDate', formats.dateFormat(), formats.timeFormat()) ?? 'mediumDate';
          const date = formatDate(Number(this.x), pattern, 'en-US', 'UTC');
          const points = this.points ?? [];
          return (
            `${date}<br/>` + points.map((point) => `<b>${point.series.name}</b>: ${formatValue(point.y ?? 0)}`).join('<br/>')
          );
        },
      },
      plotOptions: {
        area: {
          stacking: stacked ? 'normal' : undefined,
          marker: { enabled: false },
          animation: animate,
          threshold: this.zeroBased() ? 0 : null,
        },
      },
      series: series.map((item) => ({
        type: 'area' as const,
        name: item.name,
        colorIndex: TONE_INDEX[item.tone],
        data: item.points.map((point) => [point.time, point.value] as [number, number]),
      })),
    };
    this.chart = highcharts.chart(element, options);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
