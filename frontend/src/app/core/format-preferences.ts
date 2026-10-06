import { Service, computed, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';

import { DateFormat, NumberFormat, TimeFormat, numberLocale } from './preferences';

// Angular only knows `en-US` out of the box; the Indian digit grouping needs its locale data.
registerLocaleData(localeEnIn);

/**
 * How dates, times and numbers are written, as the customer chose. It holds three values and nothing else (no
 * HTTP, no account), so the formatting pipes can depend on it anywhere, including in a component that has never
 * heard of the Trade API. `PreferencesStore` is what sets it, once the saved preferences have loaded.
 */
@Service()
export class FormatPreferences {
  private readonly date = signal<DateFormat>(DateFormat.MonDdYyyy);
  private readonly time = signal<TimeFormat>(TimeFormat.H12);
  private readonly number = signal<NumberFormat>(NumberFormat.Us);

  readonly dateFormat = this.date.asReadonly();
  readonly timeFormat = this.time.asReadonly();
  readonly numberFormat = this.number.asReadonly();
  /** The locale behind the number format (`en-US` or `en-IN`). */
  readonly locale = computed(() => numberLocale(this.number()));

  apply(formats: { dateFormat: DateFormat; timeFormat: TimeFormat; numberFormat: NumberFormat }): void {
    this.date.set(formats.dateFormat);
    this.time.set(formats.timeFormat);
    this.number.set(formats.numberFormat);
  }

  /** Back to the application's own look, for when nobody is signed in. */
  reset(): void {
    this.apply({ dateFormat: DateFormat.MonDdYyyy, timeFormat: TimeFormat.H12, numberFormat: NumberFormat.Us });
  }
}
