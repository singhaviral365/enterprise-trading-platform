import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dropdown } from './dropdown';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
];

describe('Dropdown', () => {
  let fixture: ComponentFixture<Dropdown>;
  let root: HTMLElement;

  const select = () => root.querySelector<HTMLSelectElement>('select')!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Dropdown);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  it('lists the options, marking disabled ones and the selected one', async () => {
    fixture.componentRef.setInput('value', 'c');
    await fixture.whenStable();

    const options = Array.from(root.querySelectorAll('option'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(options[1].disabled).toBe(true);
    expect(options[2].selected).toBe(true);
  });

  it('shows a placeholder while nothing is selected', async () => {
    fixture.componentRef.setInput('placeholder', 'Pick one');
    await fixture.whenStable();

    const first = root.querySelector('option')!;
    expect(first.textContent?.trim()).toBe('Pick one');
    expect(first.disabled).toBe(true);
  });

  it('updates its value when the user picks an option', async () => {
    select().value = 'c';
    select().dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.value()).toBe('c');
  });

  it('labels the select and links the error text for assistive tech', async () => {
    fixture.componentRef.setInput('label', 'Currency');
    fixture.componentRef.setInput('invalid', true);
    fixture.componentRef.setInput('errorText', 'Pick a currency.');
    fixture.componentRef.setInput('inputId', 'currency');
    await fixture.whenStable();

    expect(root.querySelector('label')?.getAttribute('for')).toBe('currency');
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(select().getAttribute('aria-describedby')).toBe('currency-error');
    expect(root.querySelector('#currency-error')?.textContent).toContain('Pick a currency.');
  });

  it('can be disabled and is valid by default', async () => {
    expect(select().getAttribute('aria-invalid')).toBeNull();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();

    expect(select().disabled).toBe(true);
  });

  it('has a compact size for dense toolbars', async () => {
    expect(select().classList.contains('is-compact')).toBe(false);

    fixture.componentRef.setInput('size', 'compact');
    await fixture.whenStable();

    expect(select().classList.contains('is-compact')).toBe(true);
  });
});
