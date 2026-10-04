import { Component, input, model } from '@angular/core';

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

let nextDropdownId = 0;

/**
 * Thin wrapper around a native `<select>`. All visuals come from the global `.form-select`
 * class (CSS `appearance: base-select`); there is no positioning or styling logic in TypeScript.
 */
@Component({
  selector: 'app-dropdown',
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.css',
})
export class Dropdown {
  readonly options = input.required<readonly DropdownOption[]>();
  /** Selected option value; supports `[(value)]`. An empty string means "nothing selected". */
  readonly value = model('');
  readonly label = input('');
  /** Shown as a disabled first option while nothing is selected. */
  readonly placeholder = input('');
  readonly invalid = input(false);
  readonly errorText = input('');
  readonly disabled = input(false);
  /** `compact` shrinks the control (height, padding, font) for dense toolbars such as the pagination footer. */
  readonly size = input<'default' | 'compact'>('default');
  readonly inputId = input(`dropdown-${nextDropdownId++}`);

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
