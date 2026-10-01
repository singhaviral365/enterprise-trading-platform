import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import {
  CHANGE_FIELDS,
  CHANGE_PERCENT_FIELDS,
  CURRENCY_FIELDS,
  MarketBoard,
  MarketError,
  MarketQuote,
  MarketService,
  PREVIOUS_CLOSE_FIELDS,
  quoteField,
  quoteNumber,
} from '../../../core/market.service';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { QuoteDialog } from '../quote-dialog/quote-dialog';

/** Matches the trade-executor's cache, so each refresh can bring new prices. */
const REFRESH_MS = 30_000;

export const PAGE_SIZES = [5, 10, 25] as const;

export interface MarketRow {
  readonly quote: MarketQuote;
  readonly change: number | null;
  readonly changePercent: number | null;
  /** Last session's closing price, from the quote's previousClose. */
  readonly previousClose: number | null;
  readonly currency: string | null;
}

/** Live market table: one row per tradable instrument; clicking a row opens its quote details. */
@Component({
  selector: 'app-market-board',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, Pagination, Spinner, QuoteDialog],
  templateUrl: './market-board.html',
  styleUrl: './market-board.css',
})
export class MarketBoardPanel {
  private readonly market = inject(MarketService);

  protected readonly board = resource({ loader: () => this.market.getBoard() });
  /**
   * The last board that loaded. A failed refresh leaves `board` without a value, so this keeps the
   * previous prices on screen (with a note) instead of replacing the table with an error.
   */
  protected readonly latest = linkedSignal<MarketBoard | undefined, MarketBoard | undefined>({
    source: () => (this.board.hasValue() ? this.board.value() : undefined),
    computation: (current, previous) => current ?? previous?.value,
  });
  protected readonly selected = signal<MarketRow | null>(null);

  protected readonly rows = computed<readonly MarketRow[]>(() => {
    const quotes = this.latest()?.quotes ?? [];
    return quotes.map((quote) => {
      const currency = quoteField(quote, CURRENCY_FIELDS);
      return {
        quote,
        change: quoteNumber(quote, CHANGE_FIELDS),
        changePercent: quoteNumber(quote, CHANGE_PERCENT_FIELDS),
        previousClose: quoteNumber(quote, PREVIOUS_CLOSE_FIELDS),
        currency: typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
      };
    });
  });

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly pageSize = signal<number>(PAGE_SIZES[0]);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / this.pageSize())));
  /**
   * 1-based page. Goes back to page 1 when the page size changes, and is clamped when a refresh
   * returns fewer rows, so the table never lands on an empty page.
   */
  protected readonly page = linkedSignal<{ size: number; total: number }, number>({
    source: () => ({ size: this.pageSize(), total: this.totalPages() }),
    computation: (source, previous) =>
      previous && previous.source.size === source.size ? Math.min(previous.value, source.total) : 1,
  });
  protected readonly visibleRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });
  /** e.g. { from: 6, to: 10 } for page 2 of 5-row pages. */
  protected readonly range = computed(() => {
    const total = this.rows().length;
    const from = total === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1;
    return { from, to: Math.min(total, this.page() * this.pageSize()), total };
  });

  protected readonly errorMessage = computed(() => {
    const error = this.board.error();
    if (!error) {
      return '';
    }
    return error instanceof MarketError ? error.message : 'Market data could not be loaded.';
  });

  constructor() {
    const timer = setInterval(() => this.board.reload(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected onPageSizeChange(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if ((PAGE_SIZES as readonly number[]).includes(size)) {
      this.pageSize.set(size);
    }
  }

  protected open(row: MarketRow): void {
    this.selected.set(row);
  }
}
