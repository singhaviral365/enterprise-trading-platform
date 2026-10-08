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

import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../donut-chart/highcharts-loader';

/** What a tooltip or data-label formatter's `this` carries for a treemap point (the typings differ between the two). */
interface PointContext {
  readonly key?: string;
  readonly name?: string;
  readonly value?: number;
  readonly point?: { readonly name?: string; readonly value?: number };
}

/** One block: a name, its size, and how it moved (a percentage; null when unknown). */
export interface TreemapItem {
  readonly name: string;
  readonly value: number;
  /** The change that colours the block, in percent. Null is "unknown", drawn neutral. */
  readonly change: number | null;
  /** A second line for the tooltip, for instance the company name. */
  readonly detail?: string | null;
}

/**
 * How a change maps to a colour index. Five steps on each side of "flat" would be too many to tell apart, so there are five in
 * all: strong fall, fall, flat or unknown, rise, strong rise. The thresholds are in percent.
 */
export function changeBucket(change: number | null): 0 | 1 | 2 | 3 | 4 {
  if (change === null || !Number.isFinite(change) || Math.abs(change) < 0.5) {
    return 2;
  }
  if (change <= -2) {
    return 0;
  }
  if (change < 0) {
    return 1;
  }
  return change >= 2 ? 4 : 3;
}

/**
 * Treemap (Highcharts treemap module, lazy, styled mode): one block per item, **size = value, colour = change**. Used for "what moved
 * today, and does it matter to me": a big block that moved is news, a small one is not. Each block says its name and change in text
 * (colour is never the only signal), and "View as table" lists the same numbers.
 */
@Component({
  selector: 'app-treemap-chart',
  templateUrl: './treemap-chart.html',
  styleUrl: './treemap-chart.css',
  // Highcharts creates its SVG at runtime, outside Angular's templates, so emulated encapsulation cannot reach it.
  encapsulation: ViewEncapsulation.None,
})
export class TreemapChart {
  readonly items = input.required<readonly TreemapItem[]>();
  /** Accessible description of the chart image. */
  readonly ariaLabel = input.required<string>();
  /** Formats a block's value for the tooltip and the table. */
  readonly valueFormatter = input<(value: number) => string>((value) => String(value));
  /** What the value is called in the tooltip and the table header, for instance "Market value". */
  readonly valueName = input('Value');
  /** What the change is called, for instance "Today". */
  readonly changeName = input('Change');
  readonly height = input(280);

  private readonly loadHighcharts = inject(HIGHCHARTS_LOADER);
  private readonly loadModule = inject(HIGHCHARTS_MODULE_LOADER);
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
      void this.draw(element, this.items());
    });
  }

  protected formatChange(change: number | null): string {
    return change === null ? 'n/a' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
  }

  private async draw(element: HTMLElement, items: readonly TreemapItem[]): Promise<void> {
    const highcharts = await this.loadHighcharts();
    await this.loadModule('treemap');
    if (this.destroyed) {
      return;
    }
    this.chart?.destroy();
    const formatValue = (value: number) => this.valueFormatter()(value);
    const valueName = this.valueName();
    const changeName = this.changeName();
    const detailOf = new Map(items.map((item) => [item.name, item]));
    const formatChange = (change: number | null | undefined) =>
      change === null || change === undefined ? 'n/a' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    const options: Options = {
      chart: { styledMode: true, animation: !prefersReducedMotion(), spacing: [0, 0, 0, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        formatter() {
          const context = this as unknown as PointContext;
          const item = detailOf.get(String(context.key ?? context.point?.name ?? context.name ?? ''));
          return (
            `<b>${item?.name ?? ''}</b>` +
            (item?.detail ? `<br/>${item.detail}` : '') +
            `<br/>${valueName}: ${formatValue(Number(context.point?.value ?? context.value ?? 0))}` +
            `<br/>${changeName}: ${formatChange(item?.change)}`
          );
        },
      },
      series: [
        {
          type: 'treemap',
          layoutAlgorithm: 'squarified',
          animation: !prefersReducedMotion(),
          borderWidth: 2,
          dataLabels: {
            enabled: true,
            allowOverlap: false,
            useHTML: false,
            formatter() {
              const context = this as unknown as PointContext;
              const item = detailOf.get(String(context.point?.name ?? context.name ?? context.key ?? ''));
              return `${item?.name ?? ''}\n${formatChange(item?.change)}`;
            },
          },
          data: items.map((item) => ({
            name: item.name,
            value: Math.max(item.value, 0.0001),
            colorIndex: changeBucket(item.change),
          })),
        },
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
