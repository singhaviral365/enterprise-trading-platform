import { Service, inject, signal } from '@angular/core';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { convertCurrency, MarketService, PriceHistory } from '../../core/market.service';

/** The lowest and highest price an instrument traded at over the history we have (about a year), in the currency it is quoted in. */
export interface PriceRange {
  readonly low: number;
  readonly high: number;
  readonly currency: string | null;
}

/** The lowest low and the highest high of the candles; null for no usable candle. */
export function rangeOf(history: PriceHistory): PriceRange | null {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const candle of history.candles) {
    low = Math.min(low, candle.low ?? candle.close);
    high = Math.max(high, candle.high ?? candle.close);
  }
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high, currency: history.currency } : null;
}

/**
 * The 52-week range of each held instrument, read lazily from the candles the quote screen already uses: one request per symbol, the
 * first time the Holdings table needs it, and never again. A failure leaves that symbol without a range (the row then shows a hyphen)
 * rather than failing the page. Prices on the portfolio are in the account currency, so a range quoted in another currency is converted
 * with the rates the market board publishes (read when one is needed).
 */
@Service()
export class PriceRanges {
  private readonly market = inject(MarketService);
  private readonly accounts = inject(AccountOverviewStore);

  private readonly ranges = signal<ReadonlyMap<string, PriceRange | null>>(new Map());
  private readonly requested = new Set<string>();
  private boardRequested = false;

  /** Starts reading the ranges of these symbols that have not been asked for yet. */
  ensure(symbols: readonly string[]): void {
    for (const symbol of symbols) {
      if (!this.requested.has(symbol)) {
        this.requested.add(symbol);
        void this.load(symbol);
      }
    }
  }

  /** The symbol's range in the account currency, or null while it loads, if it failed, or when it cannot be converted. */
  accountRange(symbol: string): { low: number; high: number } | null {
    const range = this.ranges().get(symbol);
    if (!range) {
      return null;
    }
    const account = this.accounts.linked()?.overview.balance.currency ?? null;
    if (!range.currency || !account || range.currency === account) {
      return { low: range.low, high: range.high };
    }
    const rates = this.market.fxRates();
    const low = convertCurrency(rates, range.low, range.currency, account);
    const high = convertCurrency(rates, range.high, range.currency, account);
    return low === null || high === null ? null : { low, high };
  }

  private async load(symbol: string): Promise<void> {
    let range: PriceRange | null = null;
    try {
      range = rangeOf(await this.market.getPriceHistory(symbol));
    } catch {
      range = null;
    }
    this.ranges.update((all) => new Map(all).set(symbol, range));
    const account = this.accounts.linked()?.overview.balance.currency ?? null;
    if (range?.currency && account && range.currency !== account && !this.boardRequested && !this.market.fxRates()) {
      this.boardRequested = true;
      try {
        await this.market.getBoard();
      } catch {
        // Without rates the bar for a foreign-currency instrument is simply left out.
      }
    }
  }
}
