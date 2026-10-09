import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Multiselect } from './multiselect';

const OPTIONS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 3, label: 'Three' },
];

describe('Multiselect', () => {
  let fixture: ComponentFixture<Multiselect>;
  let root: HTMLElement;

  const chips = () => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));

  beforeEach(async () => {
    fixture = TestBed.createComponent(Multiselect);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  it('renders one chip per option, none pressed to begin with', () => {
    expect(chips().map((c) => c.textContent?.trim())).toEqual(['Buy', 'Sell', 'Three']);
    expect(chips().every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('toggles a chip on and off, announcing each change', async () => {
    const touched = vi.fn();
    fixture.componentInstance.touched.subscribe(touched);

    chips()[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toEqual(['sell']);
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips()[1].querySelector('.fa-check')).toBeTruthy();

    chips()[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toEqual([]);
    expect(touched).toHaveBeenCalledTimes(2);
  });

  it('keeps several selections, including numeric ids', async () => {
    chips()[0].click();
    chips()[2].click();

    expect(fixture.componentInstance.selected()).toEqual(['buy', 3]);
  });

  it('cannot be toggled in read-only mode', async () => {
    fixture.componentRef.setInput('readOnly', true);
    await fixture.whenStable();
    const touched = vi.fn();
    fixture.componentInstance.touched.subscribe(touched);

    chips()[0].click();

    expect(fixture.componentInstance.selected()).toEqual([]);
    expect(touched).not.toHaveBeenCalled();
    expect(chips()[0].getAttribute('aria-disabled')).toBe('true');
    expect(chips()[0].hasAttribute('aria-pressed')).toBe(false);
  });

  it('names the group for assistive tech', async () => {
    fixture.componentRef.setInput('label', 'Order side');
    await fixture.whenStable();

    expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Order side');
  });
});
