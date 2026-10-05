import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

/**
 * A company logo for an instrument (`iconUrl` comes from the instrument row, e.g. `/assets/icons/AAPL.svg`,
 * and the files live in `public/assets/icons`). If there is no URL, or the file is missing, it falls back to a
 * tile with the symbol's first two letters, so a missing logo never leaves a hole in a table or card.
 *
 * Decorative: the symbol is always printed next to it, so the image has an empty `alt`.
 */
@Component({
  selector: 'app-instrument-icon',
  imports: [NgOptimizedImage],
  templateUrl: './instrument-icon.html',
  styleUrl: './instrument-icon.css',
  host: {
    '[style.--icon-size.px]': 'size()',
  },
})
export class InstrumentIcon {
  readonly symbol = input.required<string>();
  readonly iconUrl = input<string | null | undefined>(null);
  /** Width and height in pixels. */
  readonly size = input(36);

  /** The URL that failed to load, so a later, different URL gets a fresh try. */
  private readonly failedUrl = signal<string | null>(null);

  protected readonly showImage = computed(() => {
    const url = this.iconUrl();
    return !!url && this.failedUrl() !== url;
  });
  protected readonly initials = computed(() => this.symbol().slice(0, 2).toUpperCase());

  protected onError(): void {
    this.failedUrl.set(this.iconUrl() ?? null);
  }
}
