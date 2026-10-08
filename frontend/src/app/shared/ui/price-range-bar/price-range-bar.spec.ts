import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PriceRangeBar } from './price-range-bar';

describe('PriceRangeBar', () => {
  let fixture: ComponentFixture<PriceRangeBar>;
  let root: HTMLElement;

  async function show(low: number | null, high: number | null, value: number | null): Promise<void> {
    fixture.componentRef.setInput('low', low);
    fixture.componentRef.setInput('high', high);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('formatter', (v: number) => `$${v}`);
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(PriceRangeBar);
    root = fixture.nativeElement as HTMLElement;
  });

  it('puts the marker where the price sits between the low and the high', async () => {
    await show(100, 200, 150);

    const marker = root.querySelector<HTMLElement>('.range-marker')!;
    expect(marker.style.left).toBe('50%');
  });

  it('says the same in words for assistive tech and the tooltip', async () => {
    await show(140, 200, 177);

    const bar = root.querySelector('[data-testid="price-range-bar"]')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toBe('52-week range: 62% of the way from the low ($140) to the high ($200)');
    expect(bar.getAttribute('title')).toBe(bar.getAttribute('aria-label'));
  });

  it('pins the marker to the ends when the price is outside the range', async () => {
    await show(100, 200, 250);
    expect(root.querySelector<HTMLElement>('.range-marker')!.style.left).toBe('100%');

    await show(100, 200, 50);
    expect(root.querySelector<HTMLElement>('.range-marker')!.style.left).toBe('0%');
  });

  it('draws the marker at the start when the price is at the low', async () => {
    await show(100, 200, 100);

    expect(root.querySelector('[data-testid="price-range-bar"]')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.range-marker')!.style.left).toBe('0%');
  });

  it.each([
    [null, 200, 150],
    [100, null, 150],
    [100, 200, null],
    [100, 100, 100],
  ])('shows a hyphen with the reason in words when it cannot be drawn (%s, %s, %s)', async (low, high, value) => {
    await show(low, high, value);

    expect(root.querySelector('[data-testid="price-range-bar"]')).toBeNull();
    expect(root.querySelector('.no-value')?.textContent).toBe('-');
    expect(root.querySelector('[data-testid="price-range-none"]')?.textContent).toBe('52-week range not available');
  });
});
