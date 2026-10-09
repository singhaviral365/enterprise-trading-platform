import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { DialogService } from '../../../core/dialog.service';

/**
 * Confirmation dialog built on the native `<dialog>` element, so focus trapping, Esc handling and
 * the backdrop come from the browser. Render `<app-dialog />` once in the app shell and open it via DialogService.
 */
@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.css',
})
export class Dialog {
  protected readonly dialog = inject(DialogService);
  private readonly element = viewChild<ElementRef<HTMLDialogElement>>('dialogElement');

  protected readonly confirmClass = computed(() => {
    switch (this.dialog.options().type) {
      case 'error':
        return 'is-error';
      case 'warning':
        return 'is-warning';
      case 'success':
        return 'is-success';
      default:
        return 'is-info';
    }
  });

  /** For destructive confirmations the safe choice (cancel) is the highlighted one. */
  protected readonly cancelClass = computed(() => {
    const type = this.dialog.options().type;
    return type === 'error' || type === 'warning' ? 'is-success' : 'is-secondary';
  });

  constructor() {
    effect(() => {
      const node = this.element()?.nativeElement;
      if (!node) {
        return;
      }
      if (this.dialog.isOpen()) {
        if (!node.open) {
          node.showModal();
        }
      } else if (node.open) {
        node.close();
      }
    });
  }

  /** Esc: let the service settle the promise instead of the browser closing the dialog silently. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.dialog.cancel();
  }

  /** Clicks on the backdrop land on the <dialog> element itself (the panel is a child). */
  protected onClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dialog.cancel();
    }
  }
}
