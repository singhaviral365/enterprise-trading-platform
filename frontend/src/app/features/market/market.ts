import { Component } from '@angular/core';
import { MarketBoardPanel } from './market-board/market-board';

/**
 * Market data page: the live quotes for every tradable instrument. It moved off the dashboard (which is about
 * the user's own account) and lives in the sidebar; clicking a row opens the quote and the order ticket.
 */
@Component({
  selector: 'app-market',
  imports: [MarketBoardPanel],
  template: `
    <header class="market-page-header">
      <h1 class="page-title" data-testid="market-page-title">Market data</h1>
    </header>
    <app-market-board />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      max-width: 1200px;
    }

    .market-page-header {
      margin-bottom: 16px;
    }
  `,
})
export class Market {}
