import { Provider } from '@angular/core';
import { vi } from 'vitest';

import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../shared/ui/donut-chart/highcharts-loader';

/**
 * Stand-ins for Highcharts and its modules, for specs that render pages with charts but are not about the charts. Drawing real SVG in a
 * test DOM is slow (a page with half a dozen charts can take seconds a test) and says nothing the chart components' own specs do not.
 * Test-only: excluded from the app build.
 */
export function provideFakeHighcharts(): Provider[] {
  const made = () => ({ destroy: vi.fn(), series: [{ setData: vi.fn(), remove: vi.fn() }], addSeries: vi.fn() });
  return [
    { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart: vi.fn(made), stockChart: vi.fn(made) }) },
    { provide: HIGHCHARTS_MODULE_LOADER, useValue: () => Promise.resolve() },
  ];
}
