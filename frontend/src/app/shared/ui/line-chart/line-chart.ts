import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { Chart, Options } from 'highcharts';
import { HIGHCHARTS_LOADER } from '../donut-chart/highcharts-loader';

/** One point of the line: epoch milliseconds and a value. */
export interface LinePoint {
  readonly time: number;
  readonly value: number;
}

/**
 * Line (area) chart over time, drawn with Highcharts loaded lazily, in *styled mode* like the donut: plain SVG with
 * `highcharts-*` classes, coloured from design tokens by `line-chart.css`, so it follows the light and dark theme
 * and no colour is written in TypeScript. The line steps (it holds a value until the next point) because the data
 * it shows changes only at discrete events, such as orders. The SVG is a labelled image; put the numbers that
 * matter in text next to it.
 */
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class LineChart {
  readonly points = input.required<readonly LinePoint[]>();
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  /** Name of the series, shown in the tooltip. */
  readonly seriesName = input('Value');
  /** Formats a value for the tooltip and the value axis. */
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));
  /** Shorter format for the value axis (e.g. "$3K"); defaults to `valueFormatter`. */
  readonly axisFormatter = input<((value: number) => string) | null>(null);

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  private chart: Chart | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const element = this.plot().nativeElement;
      const data = this.points().map((point) => [point.time, point.value] as [number, number]);
      void this.draw(element, data);
    });
  }

  private async draw(element: HTMLElement, data: Array<[number, number]>): Promise<void> {
    const highcharts = await this.loadHighcharts();
    if (this.destroyed) {
      return;
    }
    if (this.chart) {
      this.chart.series[0].setData(data, true, false);
      return;
    }
    const formatValue = (value: number) => this.valueFormatter()(value);
    const formatAxis = (value: number) => (this.axisFormatter() ?? this.valueFormatter())(value);
    const name = this.seriesName();
    const animate = !prefersReducedMotion();
    const options: Options = {
      chart: { type: 'area', styledMode: true, animation: animate, spacing: [8, 8, 4, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        type: 'datetime',
        crosshair: true,
        tickPixelInterval: 120,
        dateTimeLabelFormats: {
          hour: '%e %b, %H:%M',
          day: '%e %b',
          week: '%e %b',
          month: "%b '%y",
        },
      },
      yAxis: {
        title: { text: undefined },
        min: 0,
        tickAmount: 5,
        labels: {
          x: -8,
          formatter() {
            return formatAxis(Number(this.value));
          },
        },
      },
      tooltip: {
        formatter() {
          const date = new Date(Number(this.x)).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
          return `${date}<br/><b>${name}</b>: ${formatValue(this.y ?? 0)}`;
        },
      },
      plotOptions: {
        area: { step: 'left', marker: { enabled: false }, animation: animate },
      },
      series: [{ type: 'area', name, data }],
    };
    this.chart = highcharts.chart(element, options);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
