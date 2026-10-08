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

/** The optional Highcharts modules a chart can need beyond the core: each is its own lazy chunk. */
export type HighchartsModuleName = 'treemap' | 'stock';

/**
 * Loads one optional module (the treemap series, or the stock series such as candlesticks) and resolves once it has registered
 * itself with Highcharts. A chart calls it after {@link HIGHCHARTS_LOADER} and before it draws; each module is downloaded at most once,
 * and only by a page that draws a chart which needs it. Specs provide a no-op.
 */
export const HIGHCHARTS_MODULE_LOADER = new InjectionToken<(name: HighchartsModuleName) => Promise<void>>(
  'HIGHCHARTS_MODULE_LOADER',
  {
    providedIn: 'root',
    factory: () => {
      const loaded = new Map<HighchartsModuleName, Promise<void>>();
      return (name) => {
        let pending = loaded.get(name);
        if (!pending) {
          pending = (name === 'treemap' ? import('highcharts/modules/treemap') : import('highcharts/modules/stock')).then(
            () => undefined,
          );
          loaded.set(name, pending);
        }
        return pending;
      };
    },
  },
);
