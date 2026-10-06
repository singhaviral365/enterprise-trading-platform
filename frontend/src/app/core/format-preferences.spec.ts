import { TestBed } from '@angular/core/testing';

import { FormatPreferences } from './format-preferences';
import { DateFormat, NumberFormat, TimeFormat } from './preferences';

describe('FormatPreferences', () => {
  let formats: FormatPreferences;

  beforeEach(() => {
    formats = TestBed.inject(FormatPreferences);
  });

  it('starts as the application looked before preferences existed', () => {
    expect(formats.dateFormat()).toBe(DateFormat.MonDdYyyy);
    expect(formats.timeFormat()).toBe(TimeFormat.H12);
    expect(formats.numberFormat()).toBe(NumberFormat.Us);
    expect(formats.locale()).toBe('en-US');
  });

  it('applies the three formats together and derives the locale', () => {
    formats.apply({ dateFormat: DateFormat.YyyyMmDd, timeFormat: TimeFormat.H24, numberFormat: NumberFormat.In });

    expect(formats.dateFormat()).toBe(DateFormat.YyyyMmDd);
    expect(formats.timeFormat()).toBe(TimeFormat.H24);
    expect(formats.locale()).toBe('en-IN');
  });

  it('goes back to the defaults on reset', () => {
    formats.apply({ dateFormat: DateFormat.YyyyMmDd, timeFormat: TimeFormat.H24, numberFormat: NumberFormat.In });

    formats.reset();

    expect(formats.dateFormat()).toBe(DateFormat.MonDdYyyy);
    expect(formats.locale()).toBe('en-US');
  });
});
