import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AccountOverviewStore } from '../../../core/account-overview.store';
import { PortfolioStore } from '../../../core/portfolio.store';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { SplitView } from '../../../shared/ui/split-view/split-view';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';
import { HoldingsRows } from '../holdings-rows';
import { PositionDetail } from '../position-detail/position-detail';
import { PositionRow, toPositionRow } from '../position-row';
import { PositionsCard } from '../positions-card/positions-card';
import { PositionsTable } from '../positions-table/positions-table';

export type HoldingsView = 'card' | 'table';

/** localStorage key for the holdings view the user last chose (a per-browser convenience, never required). */
export const POSITIONS_VIEW_KEY = 'positions.view';

export const POSITION_PAGE_SIZES = [10, 20, 50] as const;

function readStoredView(): HoldingsView {
  try {
    return localStorage.getItem(POSITIONS_VIEW_KEY) === 'table' ? 'table' : 'card';
  } catch {
    return 'card';
  }
}

/**
 * The Holdings tab: every holding as cards or a table, with its price and profit and loss, the buys behind it and a way to
 * trade it. Picking one opens its detail in the split view (the list shrinks to a compact column). A notification or a link can
 * open one directly with `?symbol=AAPL`.
 */
@Component({
  selector: 'app-portfolio-holdings',
  imports: [Pagination, PositionDetail, PositionsCard, PositionsTable, RouterLink, SplitView, Tooltip],
  templateUrl: './portfolio-holdings.html',
  styleUrls: ['../portfolio-shared.css', './portfolio-holdings.css'],
})
export class PortfolioHoldings {
  protected readonly accounts = inject(AccountOverviewStore);
  protected readonly store = inject(PortfolioStore);
  private readonly holdings = inject(HoldingsRows);
  private readonly route = inject(ActivatedRoute);

  protected readonly view = signal<HoldingsView>(readStoredView());
  protected readonly summary = computed(() => this.store.snapshot()?.summary ?? null);
  protected readonly currency = computed(
    () => this.summary()?.baseCurrency ?? this.accounts.linked()?.overview.balance.currency ?? 'USD',
  );
  protected readonly held = this.holdings.held;
  protected readonly allRows = this.holdings.rows;

  protected readonly pageSizes = POSITION_PAGE_SIZES;
  protected readonly pageSize = signal<number>(POSITION_PAGE_SIZES[0]);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.allRows().length / this.pageSize())));
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

  /** The symbol whose detail is open; null when none is. */
  protected readonly selectedSymbol = signal<string | null>(null);
  /**
   * The position shown in the detail. It follows the live holding (quantity and cost update as orders fill, from the
   * account the app already holds) and keeps the last one if the position disappears while the detail is open, e.g. after
   * selling it all, so the order confirmation is not pulled out from under the user.
   */
  protected readonly detailRow = linkedSignal<{ symbol: string | null; row: PositionRow | null }, PositionRow | null>({
    source: () => {
      const symbol = this.selectedSymbol();
      const held = symbol === null ? undefined : this.held().find((candidate) => candidate.symbol === symbol);
      return { symbol, row: held ? toPositionRow(held) : null };
    },
    computation: (source, previous) => (source.symbol === null ? null : (source.row ?? previous?.value ?? null)),
  });

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  constructor() {
    // `?symbol=AAPL` opens that holding, once the holdings are known and only if it is one of them.
    effect(() => {
      const symbol = this.query().get('symbol')?.trim().toUpperCase();
      if (symbol && this.held().some((position) => position.symbol.toUpperCase() === symbol)) {
        const held = this.held().find((position) => position.symbol.toUpperCase() === symbol);
        this.selectedSymbol.set(held?.symbol ?? null);
      }
    });
  }

  protected setView(view: HoldingsView): void {
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
