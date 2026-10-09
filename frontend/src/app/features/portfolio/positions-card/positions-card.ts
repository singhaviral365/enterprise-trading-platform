import { Component, input, output } from '@angular/core';
import { InstrumentLabel } from '../../../shared/ui/instrument-label/instrument-label';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { PriceStatusBadge } from '../price-status/price-status';
import { PositionRow } from '../position-row';
import { CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/**
 * Card view of the holdings: one clickable card per holding with its logo, symbol and name, its price status, its market
 * value, unrealised and today's profit and loss and how much of it is held. A holding with no price shows its cost basis
 * instead, marked unavailable. Picking a card asks the parent for that position's details (and buy / sell).
 * Four to five cards fit on a desktop row; on a phone they stack one per row.
 */
@Component({
  selector: 'app-positions-card',
  imports: [CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDecimalPipe, InstrumentLabel, PnlValue, PriceStatusBadge],
  templateUrl: './positions-card.html',
  styleUrl: './positions-card.css',
})
export class PositionsCard {
  readonly rows = input.required<readonly PositionRow[]>();
  /** ISO code of the account currency, which every position value is in. */
  readonly currency = input<string | null>(null);
  /** The symbol whose detail is open, if any: its card is highlighted. */
  readonly selectedSymbol = input<string | null>(null);
  /** A detail is open beside the list: one column of compact cards (logo, symbol, name). */
  readonly compact = input(false);
  readonly selected = output<PositionRow>();
}
