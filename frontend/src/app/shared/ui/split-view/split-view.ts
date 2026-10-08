import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
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
 * The split container must be at least this wide for the aside to have room: the compact list (260) + a detail of at least
 * 460 + the aside (340) + two gaps (20 each). Measured on the container, not the window, because the sidebar and the page
 * padding decide what is left.
 */
export const SPLIT_ASIDE_MIN_WIDTH = 1100;

/**
 * A list with a detail pane for the selected item, and optionally a third pane (the aside) beside the detail.
 *
 * - **Wide screens:** picking an item shrinks the list to a compact column (260px) and the detail slides in to its right,
 *   so picking an item needs no extra click and the list stays in view. With an `[aside]` (turn it on with `[aside]="true"`)
 *   and enough room (see {@link SPLIT_ASIDE_MIN_WIDTH}), a tall third pane opens on the far right.
 * - **Narrow screens** (and anywhere `matchMedia` is missing): the same detail opens as a modal dialog instead, the list
 *   keeps its full width and there is no aside.
 *
 * The caller owns the selection: bind `[open]`, project the list as `[list]`, the detail as `[detail]` and, optionally, the
 * aside as `[aside]`, and clear the selection in `(closed)` (Esc, or the backdrop in dialog mode; the detail provides its
 * own close button). Template-reference the component (`#split`) to read {@link compact} (the list should show only the
 * instrument column) and {@link asideVisible} (the aside has room, so the detail should not repeat its content inline).
 *
 * ```html
 * <app-split-view #split [open]="!!selected()" [aside]="assistantOn()" labelledBy="detail-title" (closed)="selected.set(null)">
 *   <section list>...</section>
 *   <div detail>@if (selected()) { ... }</div>
 *   <div aside>@if (split.asideVisible()) { ... }</div>
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
  /** Whether the page has something for the aside pane. It is shown only while a detail is open and there is room. */
  readonly aside = input(false);
  /** The user pressed Esc, or clicked the backdrop of the dialog. */
  readonly closed = output<void>();

  /** True while the screen is wide enough for the side-by-side layout. */
  readonly inline = signal(false);
  /** The list should show only its instrument: a detail is open beside it. */
  readonly compact = computed(() => this.inline() && this.open());
  /** Width of the split container in pixels; unbounded where `ResizeObserver` is missing (tests). */
  readonly width = signal(Number.POSITIVE_INFINITY);
  /** The aside pane is shown: a detail is open beside the list, the page wants one, and the container is wide enough. */
  readonly asideVisible = computed(
    () => this.compact() && this.aside() && this.width() >= SPLIT_ASIDE_MIN_WIDTH,
  );

  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly container = viewChild<ElementRef<HTMLElement>>('container');

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

    // Follow the container's own width (a signal, so the aside appears and goes as the room changes).
    effect((onCleanup) => {
      const element = this.container()?.nativeElement;
      if (!element || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        this.width.set(entry.contentRect.width);
      });
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
  }
}
