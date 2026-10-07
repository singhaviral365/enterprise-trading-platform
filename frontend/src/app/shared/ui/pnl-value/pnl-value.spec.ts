import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PnlValue } from './pnl-value';

describe('PnlValue', () => {
  let fixture: ComponentFixture<PnlValue>;
  let root: HTMLElement;

  async function show(amount: number | null | undefined, percent: number | null = null, currency = 'USD'): Promise<void> {
    fixture.componentRef.setInput('amount', amount);
    fixture.componentRef.setInput('percent', percent);
    fixture.componentRef.setInput('currency', currency);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PnlValue] }).compileComponents();
    fixture = TestBed.createComponent(PnlValue);
    root = fixture.nativeElement as HTMLElement;
  });

  it('shows a gain with a plus sign, an up arrow and the gain style', async () => {
    await show(12.5, 3.2);

    expect(root.textContent).toContain('+$12.50');
    expect(root.textContent).toContain('(+3.20%)');
    expect(root.querySelector('.fa-arrow-trend-up')).not.toBeNull();
    expect(root.querySelector('.is-gain')).not.toBeNull();
  });

  it('shows a loss with a minus sign, a down arrow and the loss style', async () => {
    await show(-12.5, -3.2);

    expect(root.textContent).toContain('-$12.50');
    expect(root.textContent).toContain('(-3.20%)');
    expect(root.querySelector('.fa-arrow-trend-down')).not.toBeNull();
    expect(root.querySelector('.is-loss')).not.toBeNull();
  });

  it('shows exactly zero as neutral, with no sign', async () => {
    await show(0, 0);

    expect(root.textContent).toContain('$0.00');
    expect(root.textContent).not.toContain('+');
    expect(root.textContent).not.toContain('-');
    expect(root.querySelector('.fa-minus')).not.toBeNull();
    expect(root.querySelector('.is-gain, .is-loss')).toBeNull();
  });

  it('shows a missing figure as a dash that a screen reader reads as not available, never as a zero', async () => {
    await show(null);

    expect(root.querySelector('.visually-hidden')?.textContent).toBe('Not available');
    expect(root.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(root.textContent).not.toContain('$0');
  });

  it('leaves out the percentage when there is none', async () => {
    await show(5, null);

    expect(root.textContent).not.toContain('%');
  });

  it('writes the amount in the currency it is given', async () => {
    await show(10, null, 'EUR');

    expect(root.textContent).toContain('€10.00');
  });
});
