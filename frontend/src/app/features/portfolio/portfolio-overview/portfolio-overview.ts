import { Component } from '@angular/core';

import { PortfolioPerformance } from '../portfolio-performance/portfolio-performance';
import { AllocationCard } from './allocation-card';
import { ContributionCard } from './contribution-card';
import { MoversCard } from './movers-card';

/**
 * The Overview tab: the ten-second picture. A compact version of the NAV chart (with its ranges, benchmark and figures), then the
 * allocation, who made the money and what moved today. Each visual states its takeaway; the heavier analysis is one click away on
 * Performance.
 */
@Component({
  selector: 'app-portfolio-overview',
  imports: [AllocationCard, ContributionCard, MoversCard, PortfolioPerformance],
  template: `
    <app-portfolio-performance layout="compact" />
    <div class="overview-grid">
      <app-allocation-card />
      <app-contribution-card />
    </div>
    <app-movers-card />
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .overview-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }

    @media (max-width: 900px) {
      .overview-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class PortfolioOverview {}
