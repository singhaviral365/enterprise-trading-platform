import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavPoint } from '../../../api/generated/portfolio-performance';
import { MonthlyReturns } from './monthly-returns';

function nav(date: string, value: number): NavPoint {
  return { date, nav: value, value: 1000, netFlow: 0, dayPnl: 0, unrealisedPnl: 0, realisedPnlCumulative: 0, estimated: false };
}

describe('MonthlyReturns', () => {
  let fixture: ComponentFixture<MonthlyReturns>;
  let root: HTMLElement;

  const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  async function show(points: readonly NavPoint[]): Promise<void> {
    fixture.componentRef.setInput('points', points);
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(MonthlyReturns);
    root = fixture.nativeElement as HTMLElement;
  });

  it('says what it needs when there is less than a second month', async () => {
    await show([nav('2026-09-01', 1000)]);

    expect(byTestId('monthly-returns')).toBeNull();
    expect(byTestId('monthly-returns-none')?.textContent).toContain('appear once');
  });

  it('shows only the months that exist, with the return as text in each cell', async () => {
    await show([nav('2026-08-20', 1000), nav('2026-08-31', 1100), nav('2026-09-30', 1210)]);

    const headers = [...root.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Year', 'Aug', 'Sep']);
    expect(byTestId('month-2026-8')?.textContent).toContain('+10.0%');
    expect(byTestId('month-2026-9')?.textContent).toContain('+10.0%');
  });

  it('colours a month by its return, in five steps, but always writes it too', async () => {
    await show([nav('2026-07-31', 1000), nav('2026-08-31', 900), nav('2026-09-30', 910), nav('2026-10-31', 1000)]);

    expect(byTestId('month-2026-8')?.className).toContain('is-step-0');
    expect(byTestId('month-2026-9')?.className).toContain('is-step-3');
    expect(byTestId('month-2026-10')?.className).toContain('is-step-4');
    expect(byTestId('month-2026-8')?.textContent).toContain('-10.0%');
  });

  it('marks the first month as part of a month, in words and with a dashed edge', async () => {
    await show([nav('2026-08-20', 1000), nav('2026-08-31', 1100), nav('2026-09-30', 1210)]);

    expect(byTestId('month-2026-8')?.classList.contains('is-partial')).toBe(true);
    expect(byTestId('month-2026-8')?.textContent).toContain('part of a month');
    expect(byTestId('monthly-returns-partial')?.textContent).toContain('dashed');
  });

  it('lays years out as rows, with a blank cell for a month a year does not have', async () => {
    await show([nav('2025-12-15', 1000), nav('2025-12-31', 1005), nav('2026-01-31', 1010), nav('2026-03-31', 1020)]);

    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('th')?.textContent?.trim())).toEqual(['2025', '2026']);
    expect(byTestId('month-2026-2')).toBeNull();
    expect(root.querySelector('td.is-empty .visually-hidden')?.textContent).toBe('No data');
  });
});
