import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * The modal shell shared by the quote dialog and the position dialog: a native `<dialog>` (focus trap, Esc and an
 * inert background come from the browser) with a rounded panel, a blurred backdrop and a rise-in animation.
 *
 * The caller owns what it shows and when: bind `[open]`, put the content inside the tag, and close in
 * `(closed)`, which fires for Esc and for a click on the backdrop (the close button is the caller's own).
 *
 * ```html
 * <app-sheet-dialog [open]="!!selected()" labelledBy="my-title" (closed)="selected.set(null)">
 *   <h2 id="my-title">…</h2>
 * </app-sheet-dialog>
 * ```
 */
@Component({
  selector: 'app-sheet-dialog',
  templateUrl: './sheet-dialog.html',
  styleUrl: './sheet-dialog.css',
})
export class SheetDialog {
  /** Shows the dialog while true. */
  readonly open = input(false);
  /** Id of the element inside the content that names the dialog (its heading). */
  readonly labelledBy = input.required<string>();
  /** Optional `data-testid` for the native dialog element, for tests. */
  readonly testId = input<string | null>(null);
  /** The user pressed Esc or clicked the backdrop. */
  readonly closed = output<void>();

  private readonly element = viewChild<ElementRef<HTMLDialogElement>>('dialogElement');

  constructor() {
    effect(() => {
      const node = this.element()?.nativeElement;
      if (!node) {
        return;
      }
      if (this.open()) {
        if (!node.open) {
          node.showModal();
        }
      } else if (node.open) {
        node.close();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  protected onClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
