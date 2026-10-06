import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { SplitView } from '../../shared/ui/split-view/split-view';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';
import { PositionDetail } from './position-detail/position-detail';
import { PositionRow, toPositionRow } from './position-row';
import { PositionsCard } from './positions-card/positions-card';
import { PositionsTable } from './positions-table/positions-table';
import { PreferenceCurrencyPipe } from '../../shared/formatting/preference-pipes';

export type PositionsView = 'card' | 'table';

/** localStorage key for the view the user last chose (a per-browser convenience, never required). */
export const POSITIONS_VIEW_KEY = 'positions.view';

export const POSITION_PAGE_SIZES = [10, 20, 50] as const;

function readStoredView(): PositionsView {
  try {
    return localStorage.getItem(POSITIONS_VIEW_KEY) === 'table' ? 'table' : 'card';
  } catch {
    return 'card';
  }
}

/**
 * What the linked account holds right now. The page owns the data, the card / table switch, paging and the
 * selected position; the two views are presentational children, and the detail dialog handles the buys behind
 * a holding and trading more of it. Cards are the default; the switch at the top right changes to the table.
 * Reads from the shared account store, so it stays current with orders as they fill.
 */
@Component({
  selector: 'app-positions',
  imports: [
    PreferenceCurrencyPipe,
    Pagination,
    PositionDetail,
    PositionsCard,
    PositionsTable,
    RouterLink,
    Spinner,
    SplitView,
    Tooltip,
  ],
  templateUrl: './positions.html',
  styleUrl: './positions.css',
})
export class Positions {
  protected readonly store = inject(AccountOverviewStore);

  protected readonly view = signal<PositionsView>(readStoredView());

  protected readonly allRows = computed<readonly PositionRow[]>(() =>
    [...(this.store.linked()?.overview.positions ?? [])]
      .map(toPositionRow)
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );
  protected readonly currency = computed(
    () => this.store.linked()?.overview.balance.currency ?? null,
  );
  protected readonly totalCostBasis = computed(() =>
    this.allRows().reduce((sum, row) => sum + row.costBasis, 0),
  );

  protected readonly pageSizes = POSITION_PAGE_SIZES;
  protected readonly pageSize = signal<number>(POSITION_PAGE_SIZES[0]);
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.allRows().length / this.pageSize())),
  );
  /** 1-based page; back to page 1 when the size changes, and clamped when a refresh leaves fewer rows. */
  protected readonly page = linkedSignal<{ size: number; total: number }, number>({
    source: () => ({ size: this.pageSize(), total: this.totalPages() }),
    computation: (source, previous) =>
      previous && previous.source.size === source.size ? Math.min(previous.value, source.total) : 1,
  });
  protected readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.allRows().slice(start, start + this.pageSize());
  });

  /** The symbol whose dialog is open; null when none is. */
  protected readonly selectedSymbol = signal<string | null>(null);
  /**
   * The position shown in the dialog. It follows the live row (quantity and cost update as orders fill) and
   * keeps the last one if the position disappears while the dialog is open, e.g. after selling it all, so the
   * order confirmation is not pulled out from under the user.
   */
  protected readonly detailRow = linkedSignal<
    { symbol: string | null; row: PositionRow | null },
    PositionRow | null
  >({
    source: () => {
      const symbol = this.selectedSymbol();
      return {
        symbol,
        row:
          symbol === null
            ? null
            : (this.allRows().find((candidate) => candidate.symbol === symbol) ?? null),
      };
    },
    computation: (source, previous) =>
      source.symbol === null ? null : (source.row ?? previous?.value ?? null),
  });

  protected setView(view: PositionsView): void {
    this.view.set(view);
    try {
      localStorage.setItem(POSITIONS_VIEW_KEY, view);
    } catch {
      // Storage can be blocked; the choice just does not persist.
    }
  }

  protected open(row: PositionRow): void {
    this.selectedSymbol.set(row.symbol);
  }
}
