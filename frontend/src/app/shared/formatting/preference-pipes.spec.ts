import { TestBed } from '@angular/core/testing';

import { FormatPreferences } from '../../core/format-preferences';
import { DateFormat, NumberFormat, TimeFormat } from '../../core/preferences';
import { PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe } from './preference-pipes';

/** 6 October 2026, 15:07:09 local time, so the result does not depend on the machine's time zone. */
const MOMENT = new Date(2026, 9, 6, 15, 7, 9);

const NARROW_NO_BREAK_SPACE = String.fromCharCode(0x202f);
const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const plain = (text: string | null) =>
  text?.replaceAll(NARROW_NO_BREAK_SPACE, ' ').replaceAll(NO_BREAK_SPACE, ' ');

describe('preference pipes', () => {
  let formats: FormatPreferences;
  let datePipe: PreferenceDatePipe;
  let numberPipe: PreferenceDecimalPipe;
  let currencyPipe: PreferenceCurrencyPipe;

  beforeEach(() => {
    formats = TestBed.inject(FormatPreferences);
    datePipe = TestBed.runInInjectionContext(() => new PreferenceDatePipe());
    numberPipe = TestBed.runInInjectionContext(() => new PreferenceDecimalPipe());
    currencyPipe = TestBed.runInInjectionContext(() => new PreferenceCurrencyPipe());
  });

  const set = (dateFormat: DateFormat, timeFormat = TimeFormat.H12, numberFormat = NumberFormat.Us) =>
    formats.apply({ dateFormat, timeFormat, numberFormat });

  describe('date', () => {
    it('keeps the application as it looked before the preferences existed', () => {
      expect(datePipe.transform(MOMENT, 'mediumDate')).toBe('Oct 6, 2026');
      // newer locale data puts a narrow no-break space before AM / PM
      expect(plain(datePipe.transform(MOMENT, 'mediumTime'))).toBe('3:07:09 PM');
      expect(plain(datePipe.transform(MOMENT, 'medium'))).toBe('Oct 6, 2026, 3:07:09 PM');
    });

    it.each([
      [DateFormat.DdMmYyyy, '06/10/2026'],
      [DateFormat.MmDdYyyy, '10/06/2026'],
      [DateFormat.DdMonthYyyy, '06-October-2026'],
      [DateFormat.DdMonYyyy, '06-Oct-2026'],
      [DateFormat.YyyyMmDd, '2026-10-06'],
      [DateFormat.MonDdYyyy, 'Oct 6, 2026'],
    ])('writes a date as %s', (format, expected) => {
      set(format);

      expect(datePipe.transform(MOMENT, 'mediumDate')).toBe(expected);
    });

    it('writes the time on a 24-hour clock and joins both for the long form', () => {
      set(DateFormat.DdMmYyyy, TimeFormat.H24);

      expect(datePipe.transform(MOMENT, 'mediumTime')).toBe('15:07:09');
      expect(datePipe.transform(MOMENT, 'medium')).toBe('06/10/2026, 15:07:09');
    });

    it('follows a change made after it was first used (it is not memoised on its input)', () => {
      expect(datePipe.transform(MOMENT, 'mediumDate')).toBe('Oct 6, 2026');

      set(DateFormat.YyyyMmDd);

      expect(datePipe.transform(MOMENT, 'mediumDate')).toBe('2026-10-06');
    });

    it('leaves a format the template asked for specifically, and null, alone', () => {
      set(DateFormat.YyyyMmDd, TimeFormat.H24);

      expect(datePipe.transform(MOMENT, 'yyyy')).toBe('2026');
      expect(datePipe.transform(null, 'mediumDate')).toBeNull();
      expect(datePipe.transform(undefined, 'mediumDate')).toBeNull();
    });
  });

  describe('number', () => {
    it('groups by thousands for the US format', () => {
      expect(numberPipe.transform(12345678.9, '1.2-2')).toBe('12,345,678.90');
    });

    it('groups by lakh and crore for the Indian format', () => {
      set(DateFormat.MonDdYyyy, TimeFormat.H12, NumberFormat.In);

      expect(numberPipe.transform(12345678.9, '1.2-2')).toBe('1,23,45,678.90');
      expect(numberPipe.transform(100000000)).toBe('10,00,00,000');
    });

    it('passes null through, and an explicit locale wins', () => {
      set(DateFormat.MonDdYyyy, TimeFormat.H12, NumberFormat.In);

      expect(numberPipe.transform(null)).toBeNull();
      expect(numberPipe.transform(1234567, '1.0-0', 'en-US')).toBe('1,234,567');
    });
  });

  describe('currency', () => {
    it('writes the amount in the currency the template names, grouped the chosen way', () => {
      expect(currencyPipe.transform(1234567.891, 'USD')).toBe('$1,234,567.89');

      set(DateFormat.MonDdYyyy, TimeFormat.H12, NumberFormat.In);

      expect(currencyPipe.transform(1234567.891, 'USD')).toBe('$12,34,567.89');
      expect(currencyPipe.transform(1234567.891, 'INR')).toBe('₹12,34,567.89');
      expect(currencyPipe.transform(null, 'USD')).toBeNull();
    });
  });
});
