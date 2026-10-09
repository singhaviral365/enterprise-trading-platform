import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormatPreferences } from '../../../core/format-preferences';
import { PriceRangeBar } from '../../../shared/ui/price-range-bar/price-range-bar';
import { PriceRanges } from '../price-ranges';
import { InstrumentLabel } from '../../../shared/ui/instrument-label/instrument-label';
import { PnlValue } from '../../../shared/ui/pnl-value/pnl-value';
import { PriceStatusBadge } from '../price-status/price-status';
import { PositionRow } from '../position-row';
import { PreferenceCurrencyPipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/**
 * Table view of the holdings: quantity, average and cost basis, price, market value, unrealised and today's profit and loss
 * and the price status. The totals are the summary tiles above, so there is no total row. Each row is
 * clickable (and reachable with Tab, Enter and Space) and asks the parent for that position's details.
 */
@Component({
  selector: 'app-positions-table',
  imports: [PreferenceCurrencyPipe, PreferenceDecimalPipe, InstrumentLabel, PnlValue, PriceRangeBar, PriceStatusBadge],
  templateUrl: './positions-table.html',
  styleUrl: './positions-table.css',
})
export class PositionsTable {
  /** The rows to show (the parent passes one page of them). */
  readonly rows = input.required<readonly PositionRow[]>();
  /** ISO code of the account currency, which every position value is in. */
  readonly currency = input<string | null>(null);
  /** The symbol whose detail is open, if any: its row is highlighted. */
  readonly selectedSymbol = input<string | null>(null);
  /** A detail is open beside the list: show only the Instrument column. */
  readonly compact = input(false);
  readonly selected = output<PositionRow>();

  protected readonly ranges = inject(PriceRanges);
  private readonly formats = inject(FormatPreferences);

  /** Formats a price in the account currency, for the range bar's words. */
  protected readonly formatPrice = computed(() => {
    const currency = this.currency() ?? 'USD';
    const formatter = new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency });
    return (value: number) => formatter.format(value);
  });

  constructor() {
    // The table shows each holding's 52-week range, read once per symbol the first time a row needs it.
    effect(() => this.ranges.ensure(this.rows().map((row) => row.symbol)));
  }

  protected onSpace(event: Event, row: PositionRow): void {
    event.preventDefault();
    this.selected.emit(row);
  }
}
