import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiDropdown } from './multi-dropdown';

describe('MultiDropdown', () => {
  let fixture: ComponentFixture<MultiDropdown>;
  let root: HTMLElement;

  const summary = () => root.querySelector('.multi-summary')?.textContent?.trim();
  async function tick(value: string): Promise<void> {
    const box = root.querySelector<HTMLInputElement>(`input[data-value="${value}"]`)!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MultiDropdown] }).compileComponents();
    fixture = TestBed.createComponent(MultiDropdown);
    fixture.componentRef.setInput('label', 'Status');
    fixture.componentRef.setInput('options', [
      { value: 'NEW', label: 'Working' },
      { value: 'FILLED', label: 'Filled' },
      { value: 'REJECTED', label: 'Rejected' },
    ]);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows the placeholder while nothing is ticked', () => {
    expect(summary()).toBe('All');
  });

  it('shows the label for one choice and a count for several, and reports the values', async () => {
    const changes: (readonly string[])[] = [];
    fixture.componentInstance.selected.subscribe((values) => changes.push(values));

    await tick('FILLED');
    expect(summary()).toBe('Filled');
    await tick('REJECTED');
    expect(summary()).toBe('2 selected');
    expect(changes.at(-1)).toEqual(['FILLED', 'REJECTED']);
  });

  it('clears the selection', async () => {
    await tick('NEW');
    root.querySelector<HTMLButtonElement>('.multi-clear')!.click();
    await fixture.whenStable();
    expect(summary()).toBe('All');
  });

  it('with atLeastOne the last ticked option stays ticked and there is no clear button', async () => {
    fixture.componentRef.setInput('atLeastOne', true);
    fixture.componentInstance.selected.set(['NEW']);
    await fixture.whenStable();

    expect(root.querySelector('.multi-clear')).toBeNull();
    const box = root.querySelector<HTMLInputElement>('input[data-value="NEW"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(fixture.componentInstance.selected()).toEqual(['NEW']);
    expect(box.checked).toBe(true);

    await tick('FILLED');
    await tick('NEW');
    expect(fixture.componentInstance.selected()).toEqual(['FILLED']);
  });

  it('names the button after its label for assistive tech', () => {
    const button = root.querySelector('button.multi-trigger')!;
    const labelledBy = button.getAttribute('aria-labelledby')!.split(' ');
    expect(root.querySelector(`#${labelledBy[0]}`)?.textContent).toContain('Status');
  });
});
