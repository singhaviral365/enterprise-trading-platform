import { Component, input, output } from '@angular/core';
import { InstrumentLabel } from '../../../shared/ui/instrument-label/instrument-label';
import { PositionRow } from '../position-row';
import { PreferenceCurrencyPipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/**
 * Table view of the positions: quantity, average cost and cost basis per holding, with a total row. Each row is
 * clickable (and reachable with Tab, Enter and Space) and asks the parent for that position's details.
 */
@Component({
  selector: 'app-positions-table',
  imports: [PreferenceCurrencyPipe, PreferenceDecimalPipe, InstrumentLabel],
  templateUrl: './positions-table.html',
  styleUrl: './positions-table.css',
})
export class PositionsTable {
  /** The rows to show (the parent passes one page of them). */
  readonly rows = input.required<readonly PositionRow[]>();
  /** Total cost basis across every position, not just the rows shown. */
  readonly totalCostBasis = input(0);
  /** ISO code of the account currency, which every position value is in. */
  readonly currency = input<string | null>(null);
  /** The symbol whose detail is open, if any: its row is highlighted. */
  readonly selectedSymbol = input<string | null>(null);
  readonly selected = output<PositionRow>();

  protected onSpace(event: Event, row: PositionRow): void {
    event.preventDefault();
    this.selected.emit(row);
  }
}
