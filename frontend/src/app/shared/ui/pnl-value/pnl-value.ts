import { Component, computed, input } from '@angular/core';
import { PreferenceCurrencyPipe, PreferenceDecimalPipe } from '../../formatting/preference-pipes';

/**
 * A profit or loss figure that never relies on colour alone: a sign, an arrow icon and the amount, with an optional
 * percentage. A missing figure shows a small hyphen with a screen-reader phrase, never a zero (unknown is not zero).
 */
@Component({
  selector: 'app-pnl-value',
  imports: [PreferenceCurrencyPipe, PreferenceDecimalPipe],
  template: `
    @if (amount() === null || amount() === undefined) {
      <span class="pnl is-unknown">
        <span class="no-value" aria-hidden="true">-</span>
        <span class="visually-hidden">Not available</span>
      </span>
    } @else {
      <span class="pnl" [class.is-gain]="direction() > 0" [class.is-loss]="direction() < 0">
        @if (direction() === 0) {
          <span class="zero-mark" aria-hidden="true">-</span>
          <span class="visually-hidden">Unchanged</span>
        } @else {
          <i
            class="fas"
            [class.fa-arrow-trend-up]="direction() > 0"
            [class.fa-arrow-trend-down]="direction() < 0"
            aria-hidden="true"
          ></i>
        }
        <span class="pnl-amount">{{ sign() }}{{ absolute() | currency: currency() }}</span>
        @if (percent() !== null && percent() !== undefined) {
          <span class="pnl-percent">({{ sign() }}{{ absolutePercent() | number: '1.2-2' }}%)</span>
        }
      </span>
    }
  `,
  styleUrl: './pnl-value.css',
})
export class PnlValue {
  readonly amount = input<number | null | undefined>(null);
  readonly percent = input<number | null | undefined>(null);
  /** ISO code of the account currency. */
  readonly currency = input('USD');

  /** 1 for a gain, -1 for a loss, 0 for none. */
  protected readonly direction = computed(() => Math.sign(this.amount() ?? 0));
  protected readonly sign = computed(() => (this.direction() > 0 ? '+' : this.direction() < 0 ? '-' : ''));
  protected readonly absolute = computed(() => Math.abs(this.amount() ?? 0));
  protected readonly absolutePercent = computed(() => Math.abs(this.percent() ?? 0));
}
