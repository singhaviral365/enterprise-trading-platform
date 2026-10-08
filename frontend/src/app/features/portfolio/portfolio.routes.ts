import { Routes } from '@angular/router';

import { PortfolioShell } from './portfolio-shell/portfolio-shell';

/**
 * The portfolio: one parent (the title, the summary tiles and the tab bar) and four lazy tabs. Each tab is a route, so it can be
 * linked to and bookmarked, and costs nothing until it is opened. The data is shared through `PortfolioStore`, so switching tabs
 * does not fetch it again.
 */
export const PORTFOLIO_ROUTES: Routes = [
  {
    path: '',
    component: PortfolioShell,
    children: [
      {
        path: '',
        title: 'Portfolio | Trading Platform',
        loadComponent: () => import('./portfolio-overview/portfolio-overview').then((m) => m.PortfolioOverview),
      },
      {
        path: 'holdings',
        title: 'Holdings | Trading Platform',
        loadComponent: () => import('./portfolio-holdings/portfolio-holdings').then((m) => m.PortfolioHoldings),
      },
      {
        path: 'performance',
        title: 'Performance | Trading Platform',
        loadComponent: () =>
          import('./portfolio-performance-tab/portfolio-performance-tab').then((m) => m.PortfolioPerformanceTab),
      },
      {
        path: 'pnl',
        title: 'Profit and loss | Trading Platform',
        loadComponent: () => import('./portfolio-pnl/portfolio-pnl').then((m) => m.PortfolioPnl),
      },
    ],
  },
];
