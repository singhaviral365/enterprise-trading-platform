import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  signal,
} from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { MarketRow, toMarketRow } from '../../../core/market-row';
import { MarketError, MarketService } from '../../../core/market.service';
import { positionBreakdown } from '../../../core/position-lots';
import { InstrumentIcon } from '../../../shared/ui/instrument-icon/instrument-icon';
import { OrderTicket } from '../../../shared/ui/order-ticket/order-ticket';
import { SheetDialog } from '../../../shared/ui/sheet-dialog/sheet-dialog';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { PositionRow } from '../position-row';

/**
 * Details of one position, opened from a card or a table row: the symbol, name and cost basis on one line,
 * quantity and average cost, and a table of the filled BUY orders that add up to the holding (quantity and
 * cost per buy), which is how the average cost is worked out. Buy more and Sell switch the same dialog to the
 * shared order ticket, so placing the order and seeing it fill is the same flow as from the market board.
 */
@Component({
  selector: 'app-position-dialog',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, InstrumentIcon, OrderTicket, SheetDialog, Spinner],
  templateUrl: './position-dialog.html',
  styleUrl: './position-dialog.css',
})
export class PositionDialog {
  /** The position to show; null keeps the dialog closed. */
  readonly position = input<PositionRow | null>(null);
  /** ISO code of the account currency, which every value here is in. */
  readonly currency = input<string | null>(null);
  readonly closed = output<void>();

  private readonly store = inject(AccountOverviewStore);
  private readonly market = inject(MarketService);

  /** Exposed so the template passes the generated enum, never a string literal. */
  protected readonly OrderSide = OrderSide;
  protected readonly side = signal<OrderSide>(OrderSide.Buy);

  /** Details or order ticket; every newly opened position starts on its details. */
  protected readonly mode = linkedSignal<PositionRow | null, 'details' | 'order'>({
    source: this.position,
    computation: () => 'details',
  });

  /** The filled buys behind this position, from the order history the account store already holds. */
  protected readonly breakdown = computed(() => {
    const position = this.position();
    return position
      ? positionBreakdown(this.store.linked()?.overview.orders ?? [], position.symbol)
      : null;
  });
  /** Bought minus sold equals what is held. If not, older orders are missing from the history. */
  protected readonly accountsForHolding = computed(() => {
    const position = this.position();
    const breakdown = this.breakdown();
    return (
      !!position &&
      !!breakdown &&
      breakdown.boughtQuantity - breakdown.soldQuantity === position.quantity
    );
  });

  /**
   * The live quote the ticket prices against. Only fetched once the user picks Buy or Sell, and again each
   * time, so the price is fresh. It is the market board; an instrument that is no longer tradable is not on it.
   */
  protected readonly board = resource({
    params: () => (this.mode() === 'order' ? this.position()?.symbol : undefined),
    loader: () => this.market.getBoard(),
  });
  protected readonly tradeRow = computed<MarketRow | null>(() => {
    const symbol = this.position()?.symbol;
    const quote = this.board.hasValue()
      ? this.board.value().quotes.find((candidate) => candidate.symbol === symbol)
      : undefined;
    return quote ? toMarketRow(quote) : null;
  });
  protected readonly boardError = computed(() => {
    const error = this.board.error();
    if (!error) {
      return '';
    }
    return error instanceof MarketError ? error.message : 'Market data could not be loaded.';
  });

  protected openTicket(side: OrderSide): void {
    this.side.set(side);
    this.mode.set('order');
  }
}
