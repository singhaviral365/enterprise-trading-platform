import { Component, input, model, output } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import type { MarketRow } from '../../../core/market-row';
import { OrderTicket } from '../order-ticket/order-ticket';
import { QuoteSummary } from '../quote-summary/quote-summary';

/**
 * The buy / sell screen: the instrument's header and price card above the order ticket. It is the *second* screen
 * of both the market page and the positions page (their first screens differ), so placing an order looks and
 * behaves the same from either.
 *
 * ```html
 * <app-trade-panel [row]="marketRow" [(side)]="side" (cancelled)="back()" (done)="close()" (closed)="close()" />
 * ```
 */
@Component({
  selector: 'app-trade-panel',
  imports: [OrderTicket, QuoteSummary],
  template: `
    <app-quote-summary [row]="row()" (closed)="closed.emit()" />
    <app-order-ticket
      [row]="row()"
      [(side)]="side"
      (cancelled)="cancelled.emit()"
      (done)="done.emit()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class TradePanel {
  /** The instrument and its live quote. */
  readonly row = input.required<MarketRow>();
  /** Buy or sell; two-way bound so the caller can open the panel on either side. */
  readonly side = model<OrderSide>(OrderSide.Buy);
  /** "Back" from the ticket to the first screen. */
  readonly cancelled = output<void>();
  /** The user dismissed the confirmation of a placed order. */
  readonly done = output<void>();
  /** The close button in the header was pressed. */
  readonly closed = output<void>();
}
