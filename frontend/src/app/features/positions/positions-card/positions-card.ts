import { Component, input, output } from '@angular/core';
import { InstrumentLabel } from '../../../shared/ui/instrument-label/instrument-label';
import { PositionRow } from '../position-row';
import { PreferenceCurrencyPipe } from '../../../shared/formatting/preference-pipes';

/**
 * Card view of the positions: one clickable card per holding showing its logo, symbol, name and cost basis,
 * and nothing else. Picking a card asks the parent for that position's details (and buy / sell).
 * Four to five cards fit on a desktop row; on a phone they stack one per row.
 */
@Component({
  selector: 'app-positions-card',
  imports: [PreferenceCurrencyPipe, InstrumentLabel],
  templateUrl: './positions-card.html',
  styleUrl: './positions-card.css',
})
export class PositionsCard {
  readonly rows = input.required<readonly PositionRow[]>();
  /** ISO code of the account currency, which every position value is in. */
  readonly currency = input<string | null>(null);
  /** The symbol whose detail is open, if any: its card is highlighted. */
  readonly selectedSymbol = input<string | null>(null);
  readonly selected = output<PositionRow>();
}
