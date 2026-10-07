import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { PortfolioStore } from '../../core/portfolio.store';
import { PreferenceCurrencyPipe, PreferenceDatePipe } from '../../shared/formatting/preference-pipes';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { PnlValue } from '../../shared/ui/pnl-value/pnl-value';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { SplitView } from '../../shared/ui/split-view/split-view';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';
import { PortfolioPerformance } from './portfolio-performance/portfolio-performance';
import { PositionDetail } from './position-detail/position-detail';
import { PositionRow, toPositionRow, toPricedRows, toUnpricedRows } from './position-row';
import { PositionsCard } from './positions-card/positions-card';
import { PositionsTable } from './positions-table/positions-table';

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

interface RealisedRangeModel {
  from: string;
  to: string;
}

/**
 * What the account is worth now and how it has done: the summary tiles, the performance curve, every holding (as cards or
 * a table, with its price and profit and loss, the buys behind it and a way to trade it) and profit and loss by
 * instrument.
 *
 * Prices come only from the Trade API's portfolio routes. The page says how old they are: a **Delayed** marker when any
 * is stale, and a notice when some holdings could not be priced (the totals then cover the others). When nothing can be
 * priced it does not go blank: it lists the holdings it already has, unpriced, with a way to try again.
 * Gains and losses carry a sign and an arrow as well as a colour.
 *
 * The sections load independently: applying the realised date filter reloads only the profit-and-loss section, and
 * the benchmark toggle only the performance section, each with its own spinner.
 */
@Component({
  selector: 'app-portfolio',
  imports: [
    FormField,
    Pagination,
    PnlValue,
    PortfolioPerformance,
    PositionDetail,
    PositionsCard,
    PositionsTable,
    PreferenceCurrencyPipe,
    PreferenceDatePipe,
    RouterLink,
    Spinner,
    SplitView,
    Tooltip,
  ],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.css',
})
export class Portfolio {
  protected readonly accounts = inject(AccountOverviewStore);
  protected readonly store = inject(PortfolioStore);

  protected readonly summary = computed(() => this.store.snapshot()?.summary ?? null);
  protected readonly currency = computed(
    () => this.summary()?.baseCurrency ?? this.accounts.linked()?.overview.balance.currency ?? 'USD',
  );
  protected readonly held = computed(() => this.accounts.linked()?.overview.positions ?? []);

  // ---------------------------------------------------------------- holdings

  protected readonly view = signal<HoldingsView>(readStoredView());

  /** Every holding, priced when prices are up and listed unpriced when they are not. */
  protected readonly allRows = computed<readonly PositionRow[]>(() => {
    const snapshot = this.store.snapshot();
    return snapshot ? toPricedRows(snapshot.positions, this.held()) : toUnpricedRows(this.held());
  });
  protected readonly unpricedCount = computed(
    () => this.allRows().filter((row) => row.pricing?.status === 'unavailable').length,
  );
  /** Some price that was served is old (or kept after a failed refresh). */
  protected readonly anyDelayed = computed(() => this.allRows().some((row) => row.pricing?.status === 'delayed'));
  protected readonly unavailableCost = computed(() => this.allRows().reduce((sum, row) => sum + row.costBasis, 0));

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

  // ---------------------------------------------------------------- profit and loss by instrument

  protected readonly breakdown = computed(() => this.store.pnlSnapshot()?.bySymbol ?? []);
  protected readonly cash = computed(() => this.accounts.linked()?.overview.balance.cashBalance ?? 0);
  protected readonly rangeApplied = computed(() => this.store.from() !== '' || this.store.to() !== '');

  /** The realised-profit-and-loss date filter. Only what is being typed lives here; the applied range lives in the store. */
  protected readonly range = signal<RealisedRangeModel>({ from: '', to: '' });
  protected readonly rangeForm = form(this.range, (path) => {
    validate(path.to, ({ value, valueOf }) =>
      value() && valueOf(path.from) && valueOf(path.from) > value()
        ? { kind: 'range', message: 'The start date must not be after the end date.' }
        : undefined,
    );
  });

  constructor() {
    // Reads the portfolio again every minute while the page is open, and stops when it closes.
    effect((onCleanup) => {
      if (this.store.accountId() !== null) {
        onCleanup(this.store.autoRefresh());
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

  /** The Refresh button: the account (orders, positions) and every section of the portfolio. */
  protected refresh(): void {
    this.accounts.refresh();
    this.store.reload();
  }

  protected applyRange(event: Event): void {
    event.preventDefault();
    if (this.rangeForm().invalid()) {
      return;
    }
    const { from, to } = this.range();
    this.store.setRealisedRange(from, to);
  }

  protected clearRange(): void {
    this.range.set({ from: '', to: '' });
    this.store.setRealisedRange('', '');
  }
}
