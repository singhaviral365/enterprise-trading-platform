import { Component, computed, input, model } from '@angular/core';
import type { DropdownOption } from '../dropdown/dropdown';

let nextMultiDropdownId = 0;

/**
 * A dropdown that lets the user tick several options. A button shows the current choice and opens a
 * native popover (`popover` attribute) holding one checkbox per option, so light-dismiss, Esc and
 * focus return come from the browser, and the panel is placed with CSS anchor positioning.
 * An empty selection means "no filter": the button shows the placeholder (default "All").
 */
@Component({
  selector: 'app-multi-dropdown',
  templateUrl: './multi-dropdown.html',
  styleUrl: './multi-dropdown.css',
})
export class MultiDropdown {
  readonly options = input.required<readonly DropdownOption[]>();
  /** Values of the ticked options; supports `[(selected)]`. */
  readonly selected = model<readonly string[]>([]);
  /** Visible label above the button, also its accessible name. */
  readonly label = input.required<string>();
  /** Shown while nothing is ticked. */
  readonly placeholder = input('All');

  private readonly id = nextMultiDropdownId++;
  protected readonly labelId = `multi-dropdown-label-${this.id}`;
  protected readonly buttonId = `multi-dropdown-button-${this.id}`;
  protected readonly panelId = `multi-dropdown-panel-${this.id}`;
  protected readonly anchorName = `--multi-dropdown-${this.id}`;

  /** "All", the option's label, or "3 selected". */
  protected readonly summary = computed(() => {
    const ticked = this.options().filter((option) => this.selected().includes(option.value));
    if (ticked.length === 0) {
      return this.placeholder();
    }
    return ticked.length === 1 ? ticked[0].label : `${ticked.length} selected`;
  });

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(value: string): void {
    this.selected.update((values) => (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]));
  }

  protected clear(): void {
    this.selected.set([]);
  }
}
