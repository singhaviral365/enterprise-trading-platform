import { Component, input } from '@angular/core';
import { InstrumentIcon } from '../instrument-icon/instrument-icon';

/**
 * An instrument as a trader recognises it: logo, symbol and, underneath, the company name. Used wherever a
 * symbol alone is not enough: position cards and tables, the order history and the dashboard's recent orders.
 */
@Component({
  selector: 'app-instrument-label',
  imports: [InstrumentIcon],
  templateUrl: './instrument-label.html',
  styleUrl: './instrument-label.css',
})
export class InstrumentLabel {
  readonly symbol = input.required<string>();
  /** The instrument's display name; omitted from the label when empty. */
  readonly name = input<string | null | undefined>(null);
  readonly iconUrl = input<string | null | undefined>(null);
  /** Logo size in pixels. */
  readonly size = input(32);
}
