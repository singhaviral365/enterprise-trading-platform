import { Component, input, model, output } from '@angular/core';

export interface MultiselectOption {
  readonly id: string | number;
  readonly label: string;
}

/** Chip-style multi-select. Selected chips are highlighted and carry a check icon. */
@Component({
  selector: 'app-multiselect',
  templateUrl: './multiselect.html',
  styleUrl: './multiselect.css',
})
export class Multiselect {
  readonly options = input.required<readonly MultiselectOption[]>();
  /** Ids of the selected options; supports `[(selected)]`. */
  readonly selected = model<readonly (string | number)[]>([]);
  /** Display-only mode: every option is shown, none can be toggled. */
  readonly readOnly = input(false);
  /** Accessible name for the group, e.g. "Eligible branches". */
  readonly label = input('');
  /** Emits after each toggle so forms can mark the control as touched. */
  readonly touched = output<void>();

  protected isSelected(id: string | number): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string | number): void {
    if (this.readOnly()) {
      return;
    }
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.touched.emit();
  }
}
