import { Component, input, linkedSignal, output, signal } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import type { MarketRow } from '../../../core/market-row';
import { QuoteSummary } from '../../../shared/ui/quote-summary/quote-summary';
import { TradePanel } from '../../../shared/ui/trade-panel/trade-panel';

/**
 * What the market page shows for the selected instrument (in the side pane on a wide screen, in a dialog on a narrow
 * one): the price card, a placeholder for the price chart, and Buy / Sell. Buy / Sell switch to the shared
 * `TradePanel`, the same buy / sell screen the positions page uses.
 */
@Component({
  selector: 'app-quote-detail',
  imports: [QuoteSummary, TradePanel],
  templateUrl: './quote-detail.html',
  styleUrl: './quote-detail.css',
})
export class QuoteDetail {
  readonly row = input.required<MarketRow>();
  /** The pane's close button (or a finished order) asks for the detail to be dismissed. */
  readonly closed = output<void>();

  /** Quote view or order ticket; a different instrument starts on the quote view. */
  protected readonly mode = linkedSignal<MarketRow, 'quote' | 'order'>({
    source: () => this.row(),
    computation: (row, previous) =>
      previous && previous.source.quote.symbol === row.quote.symbol ? previous.value : 'quote',
  });
  /** Exposed so the template passes the generated enum, never a string literal. */
  protected readonly OrderSide = OrderSide;
  protected readonly side = signal<OrderSide>(OrderSide.Buy);

  protected openTicket(side: OrderSide): void {
    this.side.set(side);
    this.mode.set('order');
  }
}
