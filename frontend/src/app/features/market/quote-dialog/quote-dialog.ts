import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import type { MarketRow } from '../../../core/market-row';
import { MarketService, convertCurrency } from '../../../core/market.service';
import { InstrumentIcon } from '../../../shared/ui/instrument-icon/instrument-icon';
import { OrderTicket } from '../../../shared/ui/order-ticket/order-ticket';
import { SheetDialog } from '../../../shared/ui/sheet-dialog/sheet-dialog';

/**
 * Price card for one instrument (price, change, previous close), opened from a market-table row.
 * Buy / Sell switch the dialog to the order ticket for that side.
 */
@Component({
  selector: 'app-quote-dialog',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, InstrumentIcon, OrderTicket, SheetDialog],
  templateUrl: './quote-dialog.html',
  styleUrl: './quote-dialog.css',
})
export class QuoteDialog {
  /** The row to show; null keeps the dialog closed. */
  readonly row = input<MarketRow | null>(null);
  readonly closed = output<void>();

  private readonly market = inject(MarketService);
  private readonly store = inject(AccountOverviewStore);

  /**
   * What the live price comes to in the account's currency, for instruments quoted in another one; null when
   * the currencies match or the exchange rates have not loaded.
   */
  protected readonly accountEquivalent = computed(() => {
    const row = this.row();
    const accountCurrency = this.store.linked()?.overview.balance.currency;
    if (!row || row.quote.price === null || !row.currency || !accountCurrency || row.currency === accountCurrency) {
      return null;
    }
    const amount = convertCurrency(this.market.fxRates(), row.quote.price, row.currency, accountCurrency);
    return amount === null ? null : { amount, currency: accountCurrency };
  });

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
}
