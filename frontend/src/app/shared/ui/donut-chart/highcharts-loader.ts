import { InjectionToken } from '@angular/core';
import type * as HighchartsNamespace from 'highcharts';

export type HighchartsApi = typeof HighchartsNamespace;

/**
 * Loads Highcharts on first use, so the charting library is a separate lazy chunk that is only downloaded when a
 * page actually draws a chart. Specs provide a fake instead of drawing real SVG.
 */
export const HIGHCHARTS_LOADER = new InjectionToken<() => Promise<HighchartsApi>>(
  'HIGHCHARTS_LOADER',
  {
    providedIn: 'root',
    factory: () => () =>
      import('highcharts').then((module) => {
        // The ES build puts the API on `default`; some bundlers hand back the namespace itself.
        const exported = module as unknown as { default?: HighchartsApi };
        return exported.default ?? (module as HighchartsApi);
      }),
  },
);
