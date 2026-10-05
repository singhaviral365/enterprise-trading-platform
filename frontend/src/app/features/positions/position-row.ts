import { PositionResponse } from '../../api/generated/trade';

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
}

export function toPositionRow(position: PositionResponse): PositionRow {
  return {
    symbol: position.symbol,
    name: position.instrumentName,
    iconUrl: position.iconUrl ?? null,
    quantity: position.quantity,
    averageCost: position.averageCost,
    costBasis: position.quantity * position.averageCost,
  };
}
