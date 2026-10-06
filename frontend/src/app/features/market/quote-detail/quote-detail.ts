import { Component, computed, inject, input, linkedSignal, output, resource, signal } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';
import { MarketError, MarketService } from '../../../core/market.service';
import type { MarketRow } from '../../../core/market-row';
import { LineChart, LinePoint } from '../../../shared/ui/line-chart/line-chart';
import { QuoteSummary } from '../../../shared/ui/quote-summary/quote-summary';
import { TradePanel } from '../../../shared/ui/trade-panel/trade-panel';

/**
 * What the market page shows for the selected instrument (in the side pane on a wide screen, in a dialog on a narrow
 * one): the price card, a one-year chart of daily closes, and Buy / Sell. Buy / Sell switch to the shared
 * `TradePanel`, the same buy / sell screen the positions page uses.
 */
@Component({
  selector: 'app-quote-detail',
  imports: [QuoteSummary, TradePanel, LineChart],
  templateUrl: './quote-detail.html',
  styleUrl: './quote-detail.css',
})
export class QuoteDetail {
  private readonly market = inject(MarketService);

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
  protected readonly Math = Math;
  protected readonly side = signal<OrderSide>(OrderSide.Buy);

  /**
   * Its own computed so a new row for the same instrument (every price tick) leaves it unchanged; `resource` would
   * otherwise reload whenever `row` changes, even with equal params.
   */
  private readonly symbol = computed(() => this.row().quote.symbol);

  /** A year of daily candles; refetched only when the symbol changes, not on every price tick. */
  protected readonly history = resource({
    params: () => this.symbol(),
    loader: ({ params: symbol }) => this.market.getPriceHistory(symbol),
  });

  protected readonly chartPoints = computed<LinePoint[]>(() =>
    this.history.hasValue()
      ? this.history.value().candles.map((candle) => ({
          time: Date.parse(`${candle.date}T00:00:00Z`),
          value: candle.close,
        }))
      : [],
  );

  protected readonly chartError = computed(() => {
    const error = this.history.error();
    if (!error) {
      return null;
    }
    return error instanceof MarketError ? error.message : 'Price history could not be loaded.';
  });

  /** Change from the first to the last close in the window, for the text beside the chart. */
  protected readonly yearChange = computed(() => {
    const points = this.chartPoints();
    if (points.length < 2) {
      return null;
    }
    const first = points[0].value;
    const last = points[points.length - 1].value;
    return { amount: last - first, percent: first ? ((last - first) / first) * 100 : 0 };
  });

  private readonly chartCurrency = computed(
    () => (this.history.hasValue() ? this.history.value().currency : null) ?? this.row().currency,
  );

  protected readonly formatPrice = computed(() => {
    const currency = this.chartCurrency();
    if (!currency) {
      return (value: number) => value.toFixed(2);
    }
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    return (value: number) => formatter.format(value);
  });

  protected readonly formatAxis = computed(() => {
    const currency = this.chartCurrency();
    const formatter = new Intl.NumberFormat('en-US', {
      ...(currency ? { style: 'currency' as const, currency } : {}),
      maximumFractionDigits: 0,
    });
    return (value: number) => formatter.format(value);
  });

  protected readonly chartLabel = computed(() => {
    const symbol = this.row().quote.symbol;
    const change = this.yearChange();
    if (!change) {
      return `${symbol} daily closing price over the past year`;
    }
    const direction = change.amount >= 0 ? 'up' : 'down';
    return `${symbol} daily closing price over the past year, ${direction} ${Math.abs(change.percent).toFixed(2)} percent`;
  });

  protected openTicket(side: OrderSide): void {
    this.side.set(side);
    this.mode.set('order');
  }
}
