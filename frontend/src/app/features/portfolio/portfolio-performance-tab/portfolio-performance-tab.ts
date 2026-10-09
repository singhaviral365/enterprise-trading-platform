import { Component } from '@angular/core';

import { PortfolioPerformance } from '../portfolio-performance/portfolio-performance';

/** The Performance tab: how the account did over time. */
@Component({
  selector: 'app-portfolio-performance-tab',
  imports: [PortfolioPerformance],
  template: `<app-portfolio-performance layout="full" />`,
})
export class PortfolioPerformanceTab {}
