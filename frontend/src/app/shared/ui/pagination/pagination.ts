import { Component, input, model, output } from '@angular/core';
import { Tooltip } from '../tooltip/tooltip';

@Component({
  selector: 'app-pagination',
  imports: [Tooltip],
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
})
export class Pagination {
  /** 1-based current page; supports `[(currentPage)]`. */
  readonly currentPage = model.required<number>();
  readonly totalPages = input.required<number>();
  /** Emits the new page after the user navigates (not when the model is set from outside). */
  readonly pageChange = output<number>();

  protected changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.pageChange.emit(page);
    }
  }
}
