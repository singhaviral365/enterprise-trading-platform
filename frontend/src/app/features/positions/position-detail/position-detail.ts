import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
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
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { TradePanel } from '../../../shared/ui/trade-panel/trade-panel';
import { PositionRow } from '../position-row';

/**
 * What the positions page shows for the selected position (in the side pane on a wide screen, in a dialog on a narrow one): the symbol, name and cost basis on one line,
 * quantity and average cost, and a table of the filled BUY orders that add up to the holding (quantity and
 * cost per buy), which is how the average cost is worked out. Buy more and Sell switch to the shared `TradePanel`, the same buy / sell screen the market page uses.
 */
@Component({
  selector: 'app-position-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    InstrumentIcon,
    NgTemplateOutlet,
    Spinner,
    TradePanel,
  ],
  templateUrl: './position-detail.html',
  styleUrl: './position-detail.css',
})
export class PositionDetail {
  /** The position to show. */
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
    // Only a different symbol starts over: the row is replaced whenever the account reloads (e.g. as an order fills),
    // and that must not throw away the order confirmation the user is looking at.
    computation: (position, previous) =>
      previous && previous.source?.symbol === position?.symbol ? previous.value : 'details',
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
