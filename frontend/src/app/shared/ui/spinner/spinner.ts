import { Component, input } from '@angular/core';

/**
 * Loading indicator.
 * - default (`inline` false): full-page overlay that covers the viewport.
 * - `[inline]="true"`: small indicator that sits in the text flow, e.g. beside a form
 *   validation message or inside a button.
 */
@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.html',
  styleUrl: './spinner.css',
  host: { '[class.is-inline]': 'inline()' },
})
export class Spinner {
  readonly inline = input(false);
  /** Announced to screen readers; not shown visually. */
  readonly label = input('Loading');
}
