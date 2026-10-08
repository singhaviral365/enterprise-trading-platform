import { Component, computed, input, model } from '@angular/core';

/** A whole-day range as the native date inputs hold it: `YYYY-MM-DD`, or an empty string for "no limit". */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export const EMPTY_DATE_RANGE: DateRange = { from: '', to: '' };

/** The longest range the server accepts (the notifications API refuses more than 366 days). */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

let nextDateRangeId = 0;

/** `YYYY-MM-DD` in the user's own time zone. */
export function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** The first day of the range as an instant: midnight in the user's time zone. */
export function startOfDayIso(value: string): string | undefined {
  return parseDateInput(value)?.toISOString();
}

/** The last day of the range as an instant: the final millisecond of that day in the user's time zone. */
export function endOfDayIso(value: string): string | undefined {
  const day = parseDateInput(value);
  return day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).toISOString() : undefined;
}

/** Text saying what is wrong with the range, or an empty string when it can be used. */
export function dateRangeError(range: DateRange): string {
  const from = parseDateInput(range.from);
  const to = parseDateInput(range.to);
  if (from && to) {
    if (from.getTime() > to.getTime()) {
      return 'The start date is after the end date.';
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      return `Choose a range of at most ${MAX_RANGE_DAYS} days.`;
    }
  }
  return '';
}

/**
 * Two native date inputs (From and To) with preset buttons: Today, Last 7 days, Last 30 days and Clear. Empty means no
 * limit on that side. Use with `[(range)]`; the range is emitted as typed, so the page decides what to do with a range
 * that {@link dateRangeError} rejects (the error is also shown here, tied to the inputs).
 */
@Component({
  selector: 'app-date-range',
  templateUrl: './date-range.html',
  styleUrl: './date-range.css',
})
export class DateRangeControl {
  readonly range = model<DateRange>(EMPTY_DATE_RANGE);
  /** Visible, and the group's accessible name. */
  readonly label = input('Date range');

  private readonly id = nextDateRangeId++;
  protected readonly fromId = `date-range-from-${this.id}`;
  protected readonly toId = `date-range-to-${this.id}`;
  protected readonly errorId = `date-range-error-${this.id}`;

  protected readonly error = computed(() => dateRangeError(this.range()));
  protected readonly isEmpty = computed(() => this.range().from === '' && this.range().to === '');

  protected setFrom(event: Event): void {
    const from = (event.target as HTMLInputElement).value;
    this.range.update((current) => ({ ...current, from }));
  }

  protected setTo(event: Event): void {
    const to = (event.target as HTMLInputElement).value;
    this.range.update((current) => ({ ...current, to }));
  }

  /** `days` = 1 is today; 7 is today and the six days before it. */
  protected lastDays(days: number): void {
    const today = new Date(Date.now());
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    this.range.set({ from: toDateInput(start), to: toDateInput(today) });
  }

  protected clear(): void {
    this.range.set(EMPTY_DATE_RANGE);
  }
}
