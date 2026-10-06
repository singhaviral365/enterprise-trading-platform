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
import type { Chart, Options } from 'highcharts';
import { HIGHCHARTS_LOADER } from './highcharts-loader';
import { PreferenceDecimalPipe } from '../../formatting/preference-pipes';

/** One slice of the donut: a name, an optional detail line for the tooltip, and its size. */
export interface DonutSlice {
  readonly name: string;
  readonly detail?: string | null;
  readonly value: number;
}

/** How many chart colours the design system defines (`--data-categorical-1..10`). */
export const DONUT_COLOR_COUNT = 10;

/**
 * Donut chart (Highcharts, loaded lazily) for parts of a whole, with a label in the middle. Details show in the
 * tooltip on hover; there is no visible legend, so the card stays the same height however many slices there are.
 *
 * Highcharts runs in *styled mode*: it draws plain SVG shapes with `highcharts-color-N` classes and this
 * component's stylesheet fills them from the `--data-categorical-N` tokens, so the chart follows the light and
 * dark theme with no colour in TypeScript. A visually hidden list (name, share, value) is what
 * assistive tech reads; the SVG itself is a labelled image.
 */
@Component({
  selector: 'app-donut-chart',
  imports: [PreferenceDecimalPipe],
  templateUrl: './donut-chart.html',
  styleUrl: './donut-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class DonutChart {
  readonly slices = input.required<readonly DonutSlice[]>();
  /** Small caption in the middle, above the value, e.g. "Invested". */
  readonly centerLabel = input('');
  /** Big text in the middle, e.g. the formatted total. */
  readonly centerValue = input('');
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  /** Formats a slice's value for the tooltip and the screen-reader list. */
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  private chart: Chart | null = null;
  private destroyed = false;

  protected readonly total = computed(() =>
    this.slices().reduce((sum, slice) => sum + slice.value, 0),
  );
  protected readonly legend = computed(() => {
    const total = this.total();
    return this.slices().map((slice, index) => ({
      ...slice,
      share: total > 0 ? slice.value / total : 0,
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const element = this.plot().nativeElement;
      const data = this.slices().map((slice, index) => ({
        name: slice.name,
        y: slice.value,
        colorIndex: index % DONUT_COLOR_COUNT,
      }));
      void this.draw(element, data);
    });
  }

  private async draw(
    element: HTMLElement,
    data: Array<{ name: string; y: number; colorIndex: number }>,
  ): Promise<void> {
    const highcharts = await this.loadHighcharts();
    if (this.destroyed) {
      return;
    }
    if (this.chart) {
      this.chart.series[0].setData(data, true, false);
      return;
    }
    const formatValue = (value: number) => this.valueFormatter()(value);
    const detailOf = (name: string) => this.slices().find((slice) => slice.name === name)?.detail;
    const options: Options = {
      chart: {
        type: 'pie',
        styledMode: true,
        spacing: [0, 0, 0, 0],
        animation: !prefersReducedMotion(),
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        formatter() {
          const share =
            typeof this.percentage === 'number' ? ` (${this.percentage.toFixed(1)}%)` : '';
          const detail = detailOf(this.name ?? '');
          return `<b>${this.name ?? ''}</b>${detail ? `<br/>${detail}` : ''}<br/>${formatValue(this.y ?? 0)}${share}`;
        },
      },
      plotOptions: {
        pie: {
          innerSize: '70%',
          size: '100%',
          borderWidth: 2,
          dataLabels: { enabled: false },
          showInLegend: false,
          animation: !prefersReducedMotion(),
        },
      },
      series: [{ type: 'pie', name: 'Share', data }],
    };
    this.chart = highcharts.chart(element, options);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
