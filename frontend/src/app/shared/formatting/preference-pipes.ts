import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

import { FormatPreferences } from '../../core/format-preferences';
import { resolveDatePattern } from '../../core/preferences';

/*
 * Drop-in replacements for Angular's `date`, `number` and `currency` pipes that write dates, times and digits the way
 * the signed-in customer chose in Settings. They keep the same names and arguments, so a template does not change:
 * a component swaps `DatePipe` for `PreferenceDatePipe` in its `imports` and nothing else.
 *
 * They are impure on purpose. A pure pipe runs again only when its inputs change, so a customer who saves a new format
 * would see the old one until each value happened to change. An impure pipe runs on every change-detection pass and
 * reads the format signals, which is all it takes to follow the setting, and each pass is just a format call.
 */

/** `date`: the three named formats the app uses (`mediumDate`, `mediumTime`, `medium`) follow the date and time format. */
@Pipe({ name: 'date', pure: false })
export class PreferenceDatePipe implements PipeTransform {
  private readonly formats = inject(FormatPreferences);
  private readonly delegate = new DatePipe(inject(LOCALE_ID));

  transform(value: Date | string | number, format?: string, timezone?: string, locale?: string): string | null;
  transform(value: null | undefined, format?: string, timezone?: string, locale?: string): null;
  transform(
    value: Date | string | number | null | undefined,
    format?: string,
    timezone?: string,
    locale?: string,
  ): string | null;
  transform(
    value: Date | string | number | null | undefined,
    format?: string,
    timezone?: string,
    locale?: string,
  ): string | null {
    const pattern = resolveDatePattern(format, this.formats.dateFormat(), this.formats.timeFormat());
    return this.delegate.transform(value, pattern, timezone, locale);
  }
}

/** `number`: digit grouping follows the number format (US or Indian). */
@Pipe({ name: 'number', pure: false })
export class PreferenceDecimalPipe implements PipeTransform {
  private readonly formats = inject(FormatPreferences);
  private readonly delegate = new DecimalPipe(inject(LOCALE_ID));

  transform(value: number | string, digitsInfo?: string, locale?: string): string | null;
  transform(value: null | undefined, digitsInfo?: string, locale?: string): null;
  transform(value: number | string | null | undefined, digitsInfo?: string, locale?: string): string | null;
  transform(value: number | string | null | undefined, digitsInfo?: string, locale?: string): string | null {
    return this.delegate.transform(value, digitsInfo, locale ?? this.formats.locale());
  }
}

/** `currency`: digit grouping follows the number format; the currency itself is whatever the template passes. */
@Pipe({ name: 'currency', pure: false })
export class PreferenceCurrencyPipe implements PipeTransform {
  private readonly formats = inject(FormatPreferences);
  private readonly delegate = new CurrencyPipe(inject(LOCALE_ID));

  transform(
    value: number | string,
    currencyCode?: string,
    display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
    digitsInfo?: string,
    locale?: string,
  ): string | null;
  transform(
    value: null | undefined,
    currencyCode?: string,
    display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
    digitsInfo?: string,
    locale?: string,
  ): null;
  transform(
    value: number | string | null | undefined,
    currencyCode?: string,
    display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
    digitsInfo?: string,
    locale?: string,
  ): string | null;
  transform(
    value: number | string | null | undefined,
    currencyCode?: string,
    display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
    digitsInfo?: string,
    locale?: string,
  ): string | null {
    return this.delegate.transform(value, currencyCode, display, digitsInfo, locale ?? this.formats.locale());
  }
}

/**
 * `compactMoney`: an amount for a tile or card, where a long figure would be cut off or push the layout. Below the threshold (a
 * million by default) it reads exactly like `currency`; from there it is shortened the way the number format reads best: $12.35M in the
 * US format, ₹1.24Cr in the Indian one. Put the full amount in a `title` (`value | currency: code`) so nothing is lost.
 */
@Pipe({ name: 'compactMoney', pure: false })
export class CompactMoneyPipe implements PipeTransform {
  private readonly formats = inject(FormatPreferences);
  private readonly delegate = new CurrencyPipe(inject(LOCALE_ID));

  transform(value: number | string | null | undefined, currencyCode = 'USD', threshold = 1_000_000): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return null;
    }
    const locale = this.formats.locale();
    if (Math.abs(amount) < threshold) {
      return this.delegate.transform(amount, currencyCode, 'symbol', undefined, locale);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(amount);
  }
}
