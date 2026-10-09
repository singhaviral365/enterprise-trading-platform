import { Component, input, signal } from '@angular/core';

export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

let nextTooltipId = 0;

/**
 * Wraps any element and shows `text` on hover or keyboard focus (Esc dismisses it).
 * Positioned with native CSS anchor positioning, so there is no positioning code here.
 */
@Component({
  selector: 'app-tooltip',
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.css',
  host: { '[class.is-block]': 'block()' },
})
export class Tooltip {
  readonly text = input('');
  readonly position = input<TooltipPosition>('top');
  readonly disabled = input(false);
  /** Render the wrapper as `display: block` instead of `inline-flex`. */
  readonly block = input(false);

  protected readonly anchorName = `--tooltip-${nextTooltipId++}`;
  protected readonly visible = signal(false);

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.visible.set(false);
    }
  }
}
