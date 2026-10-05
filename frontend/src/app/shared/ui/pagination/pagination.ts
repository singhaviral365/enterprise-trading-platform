import { Component, computed, input, model, output } from '@angular/core';
import { Dropdown, DropdownOption } from '../dropdown/dropdown';
import { Tooltip } from '../tooltip/tooltip';

let nextPaginationId = 0;

/**
 * Previous / next page controls. Pass `pageSizeOptions` (and bind `[(pageSize)]` plus `totalItems`) to also show a
 * "Rows per page" dropdown and the "from-to of total" range; without them it is just the page buttons.
 */
@Component({
  selector: 'app-pagination',
  imports: [Dropdown, Tooltip],
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
})
export class Pagination {
  /** 1-based current page; supports `[(currentPage)]`. */
  readonly currentPage = model.required<number>();
  readonly totalPages = input.required<number>();
  /** Emits the new page after the user navigates (not when the model is set from outside). */
  readonly pageChange = output<number>();

  /** Rows-per-page choices; empty hides the selector and the range. */
  readonly pageSizeOptions = input<readonly number[]>([]);
  /** Rows per page; supports `[(pageSize)]`. Only used when `pageSizeOptions` is set. */
  readonly pageSize = model(10);
  /** Total rows across all pages, for the range text. */
  readonly totalItems = input(0);

  protected readonly sizeId = `pagination-size-${nextPaginationId++}`;
  protected readonly sizeChoices = computed<readonly DropdownOption[]>(() =>
    this.pageSizeOptions().map((size) => ({ value: String(size), label: String(size) })),
  );
  /** e.g. { from: 6, to: 10, total: 23 } for page 2 of 5-row pages. */
  protected readonly range = computed(() => {
    const total = this.totalItems();
    const size = this.pageSize();
    const from = total === 0 ? 0 : (this.currentPage() - 1) * size + 1;
    return { from, to: Math.min(total, this.currentPage() * size), total };
  });

  protected changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.pageChange.emit(page);
    }
  }

  /** Only sizes offered by the dropdown are accepted; a new size starts again from page 1. */
  protected changePageSize(value: string): void {
    const size = Number(value);
    if (!this.pageSizeOptions().includes(size) || size === this.pageSize()) {
      return;
    }
    this.pageSize.set(size);
    this.currentPage.set(1);
  }
}
