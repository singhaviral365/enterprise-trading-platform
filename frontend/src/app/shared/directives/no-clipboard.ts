import { Directive, output } from '@angular/core';

/**
 * Stops copy, cut, paste and drag-and-drop on an input (used on password fields) and emits
 * `clipboardBlocked` so the form can explain why nothing happened. Browser/password-manager
 * autofill is not a clipboard action, so it keeps working.
 */
@Directive({
  selector: 'input[appNoClipboard]',
  host: {
    '(copy)': 'block($event)',
    '(cut)': 'block($event)',
    '(paste)': 'block($event)',
    '(drop)': 'block($event)',
    '(dragstart)': 'block($event)',
  },
})
export class NoClipboard {
  readonly clipboardBlocked = output<string>();

  protected block(event: Event): void {
    event.preventDefault();
    this.clipboardBlocked.emit(event.type);
  }
}
