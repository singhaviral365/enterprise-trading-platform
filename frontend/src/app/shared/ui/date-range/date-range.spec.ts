import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DateRangeControl,
  EMPTY_DATE_RANGE,
  dateRangeError,
  endOfDayIso,
  startOfDayIso,
  toDateInput,
} from './date-range';

describe('date range helpers', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('turns a day into the first and the last instant of that day in the local time zone', () => {
    expect(startOfDayIso('2026-09-30')).toBe(new Date(2026, 8, 30, 0, 0, 0, 0).toISOString());
    expect(endOfDayIso('2026-09-30')).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).toISOString());
    expect(startOfDayIso('')).toBeUndefined();
    expect(endOfDayIso('not a date')).toBeUndefined();
  });

  it('accepts open-ended and sensible ranges, and explains the others', () => {
    expect(dateRangeError({ from: '', to: '' })).toBe('');
    expect(dateRangeError({ from: '2026-09-01', to: '' })).toBe('');
    expect(dateRangeError({ from: '', to: '2026-09-01' })).toBe('');
    expect(dateRangeError({ from: '2026-09-01', to: '2026-09-30' })).toBe('');
    expect(dateRangeError({ from: '2026-09-30', to: '2026-09-01' })).toContain('after');
    expect(dateRangeError({ from: '2025-01-01', to: '2026-09-01' })).toContain('366');
    expect(dateRangeError({ from: '2025-09-01', to: '2026-09-02' })).toBe('');
  });
});

describe('DateRangeControl', () => {
  let fixture: ComponentFixture<DateRangeControl>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function typeDate(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DateRangeControl] }).compileComponents();
    fixture = TestBed.createComponent(DateRangeControl);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('is two labelled date inputs in a named group, empty at first', () => {
    expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Date range');
    expect(root.querySelector('label[for]')?.textContent).toContain('From');
    expect(byTestId<HTMLInputElement>('date-range-from')!.value).toBe('');
    expect(byTestId<HTMLButtonElement>('date-range-clear')!.disabled).toBe(true);
  });

  it('updates the range as dates are typed', async () => {
    await typeDate('date-range-from', '2026-09-01');
    await typeDate('date-range-to', '2026-09-30');

    expect(fixture.componentInstance.range()).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(byTestId('date-range-error')).toBeNull();
  });

  it('shows an error tied to both inputs when the start is after the end', async () => {
    await typeDate('date-range-from', '2026-09-30');
    await typeDate('date-range-to', '2026-09-01');

    const error = byTestId('date-range-error')!;
    expect(error.textContent).toContain('after');
    expect(byTestId('date-range-from')!.getAttribute('aria-describedby')).toBe(error.id);
    expect(byTestId('date-range-to')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('presets fill both dates ending today, and Any date clears them', async () => {
    byTestId<HTMLButtonElement>('date-range-7')!.click();
    await fixture.whenStable();

    const today = new Date(Date.now());
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    expect(fixture.componentInstance.range()).toEqual({ from: toDateInput(start), to: toDateInput(today) });

    byTestId<HTMLButtonElement>('date-range-today')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.range()).toEqual({ from: toDateInput(today), to: toDateInput(today) });

    byTestId<HTMLButtonElement>('date-range-clear')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.range()).toEqual(EMPTY_DATE_RANGE);
  });
});
