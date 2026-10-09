import { OrderHistoryEntry } from '../api/generated/trade';
import type { Candle, TradeMarker } from '../shared/ui/candle-chart/candle-chart';
import { PriceHistory } from './market.service';

/** The candles a chart can draw: a day needs all four prices (a day the market was closed may have none). Oldest first. */
export function toCandles(history: PriceHistory): Candle[] {
  const candles: Candle[] = [];
  for (const candle of history.candles) {
    if (candle.open !== null && candle.high !== null && candle.low !== null) {
      candles.push({
        time: Date.parse(`${candle.date}T00:00:00Z`),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    }
  }
  return candles;
}

/**
 * The customer's filled buys and sells of one instrument as chart markers. An order records the price in the account currency, the
 * chart is in the instrument's, so `toChartCurrency` converts one to the other; an order it cannot convert is left out rather than
 * drawn in the wrong place. Only orders inside the span the chart covers are returned.
 */
export function toTradeMarkers(
  orders: readonly OrderHistoryEntry[],
  symbol: string,
  firstTime: number,
  toChartCurrency: (amount: number) => number | null,
): TradeMarker[] {
  const markers: TradeMarker[] = [];
  for (const order of orders) {
    if (order.symbol !== symbol || order.status !== 'FILLED' || order.executedPrice == null) {
      continue;
    }
    const time = Date.parse(order.createdOn);
    const dayStart = Date.UTC(new Date(time).getUTCFullYear(), new Date(time).getUTCMonth(), new Date(time).getUTCDate());
    const price = toChartCurrency(order.executedPrice);
    if (price !== null && Number.isFinite(dayStart) && dayStart >= firstTime) {
      markers.push({ time: dayStart, price, side: order.side === 'SELL' ? 'SELL' : 'BUY', quantity: order.quantity });
    }
  }
  return markers.sort((a, b) => a.time - b.time);
}
