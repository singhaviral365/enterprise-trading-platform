import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
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
import { MarketError, MarketService, convertCurrency } from '../../../core/market.service';
import { toCandles, toTradeMarkers } from '../../../core/price-candles';
import { positionBreakdown } from '../../../core/position-lots';
import { FormatPreferences } from '../../../core/format-preferences';
import { CandleChart } from '../../../shared/ui/candle-chart/candle-chart';
import { InstrumentIcon } from '../../../shared/ui/instrument-icon/instrument-icon';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { TradePanel } from '../../../shared/ui/trade-panel/trade-panel';
import { PositionRow } from '../position-row';
import { PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/**
 * What the positions page shows for the selected position (in the side pane on a wide screen, in a dialog on a narrow one): the symbol, name and cost basis on one line,
 * quantity and average cost, and a table of the filled BUY orders that add up to the holding (quantity and
 * cost per buy), which is how the average cost is worked out. Above them a candlestick chart of the past year shows the customer's own
 * average cost as a dashed line and their buys and sells as markers. Buy more and Sell switch to the shared `TradePanel`, the same buy / sell screen the market page uses.
 */
@Component({
  selector: 'app-position-detail',
  imports: [
    PreferenceCurrencyPipe,
    PreferenceDatePipe,
    PreferenceDecimalPipe,
    CandleChart,
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
  private readonly formats = inject(FormatPreferences);

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

  // ---- The price chart with the customer's own cost and trades ------------------------------------------------------

  /** A year of daily candles for the symbol; read again only when the symbol changes. */
  protected readonly history = resource({
    params: () => this.position()?.symbol,
    loader: ({ params: symbol }) => this.market.getPriceHistory(symbol),
  });
  protected readonly candles = computed(() => (this.history.hasValue() ? toCandles(this.history.value()) : []));
  protected readonly chartCurrency = computed(() => (this.history.hasValue() ? this.history.value().currency : null));

  /** An amount in the account currency, in the currency the chart is drawn in; null if the rates are not there to convert it. */
  private readonly toChartCurrency = computed(() => {
    const account = this.currency();
    const chart = this.chartCurrency();
    const rates = this.market.fxRates();
    return (amount: number): number | null =>
      !account || !chart || account === chart ? amount : convertCurrency(rates, amount, account, chart);
  });
  protected readonly chartAverageCost = computed(() => {
    const position = this.position();
    return position ? this.toChartCurrency()(position.averageCost) : null;
  });
  protected readonly chartTrades = computed(() => {
    const position = this.position();
    const first = this.candles()[0]?.time;
    if (!position || first === undefined) {
      return [];
    }
    return toTradeMarkers(this.store.linked()?.overview.orders ?? [], position.symbol, first, this.toChartCurrency());
  });
  protected readonly formatChartPrice = computed(() => {
    const currency = this.chartCurrency() ?? this.currency();
    if (!currency) {
      return (value: number) => value.toFixed(2);
    }
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency });
    return (value: number) => formatter.format(value);
  });
  protected readonly chartError = computed(() => {
    const error = this.history.error();
    if (!error) {
      return '';
    }
    return error instanceof MarketError ? error.message : 'Price history could not be loaded.';
  });
  protected readonly chartLabel = computed(() => {
    const position = this.position();
    const trades = this.chartTrades().length;
    return (
      `${position?.symbol ?? ''} daily candles over the past year with your average cost as a dashed line` +
      (trades ? ` and ${trades} of your ${trades === 1 ? 'trade' : 'trades'} marked` : '')
    );
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

  constructor() {
    // A holding in another currency than the account needs the board's exchange rates to draw its average cost and trades.
    effect(() => {
      const account = this.currency();
      const chart = this.chartCurrency();
      if (account && chart && account !== chart && !this.market.fxRates()) {
        void this.market.getBoard().catch(() => undefined);
      }
    });
  }

  protected openTicket(side: OrderSide): void {
    this.side.set(side);
    this.mode.set('order');
  }
}
