import { Component, computed, input } from '@angular/core';

/**
 * A tiny inline bar for a table row: where a price sits between a low and a high (the 52-week range), with a marker. It is a picture
 * of a number, so it says the same thing in words to assistive tech and in a tooltip-sized title: "62% of the way from the low (140) to the
 * high (200)". With no range (no history, or low equal to high) it shows a hyphen instead of a bar.
 */
@Component({
  selector: 'app-price-range-bar',
  templateUrl: './price-range-bar.html',
  styleUrl: './price-range-bar.css',
})
export class PriceRangeBar {
  readonly low = input.required<number | null>();
  readonly high = input.required<number | null>();
  readonly value = input.required<number | null>();
  /** Formats the low, the high and the price in words. */
  readonly formatter = input<(value: number) => string>((value) => String(value));
  /** What the range is, in words: "52-week range". */
  readonly name = input('52-week range');

  /** How far along the range the price is, 0 to 100, or null when it cannot be told. */
  protected readonly position = computed(() => {
    const low = this.low();
    const high = this.high();
    const value = this.value();
    if (low === null || high === null || value === null || !(high > low)) {
      return null;
    }
    return Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  });

  protected readonly description = computed(() => {
    const position = this.position();
    if (position === null) {
      return `${this.name()} not available`;
    }
    const format = this.formatter();
    return `${this.name()}: ${Math.round(position)}% of the way from the low (${format(this.low()!)}) to the high (${format(this.high()!)})`;
  });
}
