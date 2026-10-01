import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, effect, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import type { MarketRow } from '../market-board/market-board';
import { OrderTicket } from '../order-ticket/order-ticket';

/**
 * Price card for one instrument (price, change, previous close), opened from a market-table row.
 * Buy / Sell switch the dialog to the order ticket for that side.
 */
@Component({
  selector: 'app-quote-dialog',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, OrderTicket],
  templateUrl: './quote-dialog.html',
  styleUrl: './quote-dialog.css',
})
export class QuoteDialog {
  /** The row to show; null keeps the dialog closed. */
  readonly row = input<MarketRow | null>(null);
  readonly closed = output<void>();

  private readonly element = viewChild<ElementRef<HTMLDialogElement>>('dialogElement');

  /** Quote view or order ticket; every newly opened instrument starts on the quote view. */
  protected readonly mode = linkedSignal<MarketRow | null, 'quote' | 'order'>({
    source: this.row,
    computation: () => 'quote',
  });
  /** Exposed so the template passes the generated enum, never a string literal. */
  protected readonly OrderSide = OrderSide;
  protected readonly side = signal<OrderSide>(OrderSide.Buy);

  protected openTicket(side: OrderSide): void {
    this.side.set(side);
    this.mode.set('order');
  }

  /** The quote's timestamp (asOf), shown as a date in the header; null when missing or unparseable. */
  protected readonly asOf = computed(() => {
    const value = this.row()?.quote.details?.['asOf'];
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  });

  constructor() {
    effect(() => {
      const node = this.element()?.nativeElement;
      if (!node) {
        return;
      }
      if (this.row()) {
        if (!node.open) {
          node.showModal();
        }
      } else if (node.open) {
        node.close();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  protected onClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
