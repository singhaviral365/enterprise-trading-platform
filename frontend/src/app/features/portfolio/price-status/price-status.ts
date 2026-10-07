import { Component, input } from '@angular/core';

import { PreferenceDatePipe } from '../../../shared/formatting/preference-pipes';
import { PriceStatus } from '../position-row';

/** Whether a price is live, delayed or unavailable, in words with an icon, and when a delayed price was observed. */
@Component({
  selector: 'app-price-status',
  imports: [PreferenceDatePipe],
  template: `
    @switch (status()) {
      @case ('unavailable') {
        <span class="badge is-unavailable"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Unavailable</span>
      }
      @case ('delayed') {
        <span class="badge is-delayed"><i class="fas fa-clock" aria-hidden="true"></i> Delayed</span>
        @if (asOf()) {
          <span class="as-of">as of {{ asOf() | date: 'mediumTime' }}</span>
        }
      }
      @default {
        <span class="badge is-live"><span class="live-dot" aria-hidden="true"></span> Live</span>
      }
    }
  `,
  styleUrl: './price-status.css',
})
export class PriceStatusBadge {
  readonly status = input.required<PriceStatus>();
  /** When the price was observed (ISO). */
  readonly asOf = input<string | null>(null);
}
