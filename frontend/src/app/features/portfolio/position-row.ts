import { PricedPosition } from '../../api/generated/portfolio';
import { PositionResponse } from '../../api/generated/trade';

/** How fresh a price is. Always shown in words as well as an icon, never by colour alone. */
export type PriceStatus = 'live' | 'delayed' | 'unavailable';

/**
 * What the portfolio adds to a holding: its price and the figures that need one. Every figure is null when the instrument
 * could not be priced (unknown is not zero). Money is in the account currency.
 */
export interface PositionPricing {
  readonly status: PriceStatus;
  readonly lastPrice: number | null;
  readonly marketValue: number | null;
  readonly unrealisedPnl: number | null;
  readonly unrealisedPercent: number | null;
  readonly dayPnl: number | null;
  readonly dayPnlPercent: number | null;
  /** When the price was observed (ISO), or null when there is none. */
  readonly priceAsOf: string | null;
}

/** One position as the card view, the table view and the detail dialog show it. */
export interface PositionRow {
  readonly symbol: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly quantity: number;
  /** Weighted average cost per unit, in the account currency. */
  readonly averageCost: number;
  /** Quantity times average cost. */
  readonly costBasis: number;
  /** Null where the row is shown without prices (the views then show cost only). */
  readonly pricing: PositionPricing | null;
}

const UNAVAILABLE: PositionPricing = {
  status: 'unavailable',
  lastPrice: null,
  marketValue: null,
  unrealisedPnl: null,
  unrealisedPercent: null,
  dayPnl: null,
  dayPnlPercent: null,
  priceAsOf: null,
};

export function toPositionRow(position: PositionResponse, pricing: PositionPricing | null = null): PositionRow {
  return {
    symbol: position.symbol,
    name: position.instrumentName,
    iconUrl: position.iconUrl ?? null,
    quantity: position.quantity,
    averageCost: position.averageCost,
    costBasis: position.quantity * position.averageCost,
    pricing,
  };
}

/** What the page shows when nothing could be priced: the holdings it already knows, each marked unavailable. */
export function toUnpricedRows(held: readonly PositionResponse[]): PositionRow[] {
  return held
    .filter((position) => position.quantity > 0)
    .map((position) => toPositionRow(position, UNAVAILABLE))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * The holdings with their prices. The name and logo come from the positions the app already holds; the priced route is
 * contract-exact and has neither. A holding the portfolio did not price keeps its row, marked unavailable.
 */
export function toPricedRows(priced: readonly PricedPosition[], held: readonly PositionResponse[]): PositionRow[] {
  const known = new Map(held.map((position) => [position.symbol.toUpperCase(), position]));
  return priced
    .map((position): PositionRow => {
      const identity = known.get(position.symbol.toUpperCase());
      const hasPrice = position.lastPrice != null;
      return {
        symbol: position.symbol,
        name: identity?.instrumentName ?? '',
        iconUrl: identity?.iconUrl ?? null,
        quantity: position.quantity,
        averageCost: position.averageCost,
        costBasis: position.costBasis,
        pricing: {
          status: !hasPrice ? 'unavailable' : position.stale ? 'delayed' : 'live',
          lastPrice: position.lastPrice ?? null,
          marketValue: position.marketValue ?? null,
          unrealisedPnl: position.unrealisedPnl ?? null,
          unrealisedPercent: position.unrealisedPnlPercent ?? null,
          dayPnl: position.dayPnl ?? null,
          dayPnlPercent: position.dayPnlPercent ?? null,
          priceAsOf: position.priceAsOf ?? null,
        },
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
