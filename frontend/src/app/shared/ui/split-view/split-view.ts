import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { SheetDialog } from '../sheet-dialog/sheet-dialog';

/** Width from which there is room for a list and a detail pane side by side. */
export const SPLIT_VIEW_QUERY = '(min-width: 1100px)';

/**
 * A list with a detail pane for the selected item.
 *
 * - **Wide screens:** the detail slides in on the right and the list compresses to half the width, so picking an item
 *   needs no extra click and the list stays in view.
 * - **Narrow screens** (and anywhere `matchMedia` is missing): the same detail opens as a modal dialog instead.
 *
 * The caller owns the selection: bind `[open]`, project the list as `[list]` and the detail as `[detail]`, and clear
 * the selection in `(closed)` (Esc, or the backdrop in dialog mode; the detail provides its own close button).
 *
 * ```html
 * <app-split-view [open]="!!selected()" labelledBy="detail-title" (closed)="selected.set(null)">
 *   <section list>...</section>
 *   <div detail>@if (selected()) { ... }</div>
 * </app-split-view>
 * ```
 */
@Component({
  selector: 'app-split-view',
  imports: [NgTemplateOutlet, SheetDialog],
  templateUrl: './split-view.html',
  styleUrl: './split-view.css',
})
export class SplitView {
  /** Show the detail pane (or dialog). */
  readonly open = input(false);
  /** Id of the heading inside the detail that names it. */
  readonly labelledBy = input.required<string>();
  /** Optional `data-testid` for the detail pane / dialog, for tests. */
  readonly testId = input<string | null>(null);
  /**
   * How the list is laid out. `table` (default) animates the columns, so the list glides narrower. `cards` is a
   * wrapping grid that would re-flow on every frame, so its columns change at once, the cards settle with a short
   * fade and the detail slides in over the right edge instead.
   */
  readonly layout = input<'table' | 'cards'>('table');
  /** The user pressed Esc, or clicked the backdrop of the dialog. */
  readonly closed = output<void>();

  /** True while the screen is wide enough for the side-by-side layout. */
  readonly inline = signal(false);

  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(SPLIT_VIEW_QUERY);
      this.inline.set(query.matches);
      const onChange = (event: MediaQueryListEvent) => this.inline.set(event.matches);
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }

    // Move focus into a pane that has just opened, so keyboard users land on the detail they picked.
    effect(() => {
      const pane = this.pane()?.nativeElement;
      if (pane && this.inline() && this.open()) {
        queueMicrotask(() => pane.focus({ preventScroll: true }));
      }
    });
  }
}
