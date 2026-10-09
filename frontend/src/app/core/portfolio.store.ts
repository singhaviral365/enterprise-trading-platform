import { HttpErrorResponse } from '@angular/common/http';
import { Service, computed, effect, inject, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PnlResponse, PortfolioSummary, PricedPosition, RealisedPnlResponse } from '../api/generated/portfolio';
import { PerformanceResponse } from '../api/generated/portfolio-performance';
import { PortfolioApi, isBuilding } from '../api/portfolio-api.service';
import { AccountOverviewStore, accountIdFromNumber } from './account-overview.store';
import { describeError, errorCodeOf } from './errors/describe-error';

/** How often the portfolio is read again while the page is open. The server caches quotes, so this is cheap. */
export const PORTFOLIO_REFRESH_MS = 60_000;

/** While the history is being built for the first time, ask again this often, a bounded number of times. */
export const HISTORY_POLL_MS = 4_000;
export const HISTORY_MAX_POLLS = 15;

/** What a successful read of the portfolio holds: the summary and the priced positions. */
export interface PortfolioSnapshot {
  readonly status: 'priced';
  readonly summary: PortfolioSummary;
  readonly positions: readonly PricedPosition[];
}

/**
 * No price could be obtained for any holding (`503` with `MKT-503`). A state the page shows, not an error it fails on.
 * Realised profit and loss needs no price, so it is read from its own route and shown anyway (null if even that failed).
 */
export interface PortfolioUnavailable {
  readonly status: 'unavailable';
  readonly realised: RealisedPnlResponse | null;
}

export type PortfolioState = PortfolioSnapshot | PortfolioUnavailable;

/** The profit-and-loss-by-instrument section: the breakdown, or "needs prices, which are down". */
export type PnlState = { readonly status: 'priced'; readonly pnl: PnlResponse } | { readonly status: 'unavailable' };

/** True for the contract's "pricing unavailable for every held instrument". */
export function isPricingUnavailable(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 503 && errorCodeOf(error) === 'MKT-503';
}

/**
 * The signed-in customer's portfolio, in three parts that load and reload **independently**, so changing one never makes the
 * page start over:
 *
 * - `data`: the summary and the priced positions (the tiles and the holdings).
 * - `pnl`: profit and loss by instrument. The realised date filter is its input, so applying a filter reloads this section
 *   alone.
 * - `performance`: the closed-day history and NAV curve. Its benchmark toggle reloads only it.
 *
 * Prices reach the screen only through the portfolio routes (the browser never calls Fauxnance). When nothing can be priced
 * (`MKT-503`) that becomes {@link PortfolioUnavailable}, so the page can fall back to the holdings it already has; any other
 * failure is an error, with a sentence.
 */
@Service()
export class PortfolioStore {
  private readonly accounts = inject(AccountOverviewStore);
  private readonly api = inject(PortfolioApi);

  readonly accountId = computed(() => accountIdFromNumber(this.accounts.linked()?.accountNumber ?? null));

  // ---------------------------------------------------------------- summary and positions

  readonly data = resource({
    params: () => {
      const accountId = this.accountId();
      return accountId === null ? undefined : { accountId };
    },
    loader: async ({ params }): Promise<PortfolioState> => {
      try {
        const [summary, positions] = await Promise.all([
          firstValueFrom(this.api.summary(params.accountId)),
          firstValueFrom(this.api.positions(params.accountId)),
        ]);
        return { status: 'priced', summary, positions };
      } catch (error) {
        if (isPricingUnavailable(error)) {
          return { status: 'unavailable', realised: await this.realisedAlone(params.accountId) };
        }
        throw error;
      }
    },
  });

  /** What was realised at sales while pricing is down, or null (pricing is up, or it could not be read either). */
  readonly unavailableRealised = computed<RealisedPnlResponse | null>(() => {
    const state = this.data.hasValue() ? this.data.value() : null;
    return state?.status === 'unavailable' ? state.realised : null;
  });

  readonly snapshot = computed<PortfolioSnapshot | null>(() => {
    const state = this.data.hasValue() ? this.data.value() : null;
    return state?.status === 'priced' ? state : null;
  });
  readonly unavailable = computed(() => (this.data.hasValue() ? this.data.value().status === 'unavailable' : false));
  readonly errorMessage = computed(() => {
    const error = this.data.error();
    return error ? describeError(error) : '';
  });

  // ---------------------------------------------------------------- profit and loss by instrument

  /** The realised date filter applied (`YYYY-MM-DD`, or empty for no bound). */
  readonly from = signal('');
  readonly to = signal('');

  readonly pnl = resource({
    params: () => {
      const accountId = this.accountId();
      return accountId === null ? undefined : { accountId, from: this.from(), to: this.to() };
    },
    loader: async ({ params }): Promise<PnlState> => {
      try {
        const pnl = await firstValueFrom(this.api.pnl(params.accountId, { from: params.from, to: params.to, bySymbol: true }));
        return { status: 'priced', pnl };
      } catch (error) {
        if (isPricingUnavailable(error)) {
          return { status: 'unavailable' };
        }
        throw error;
      }
    },
  });

  readonly pnlSnapshot = computed<PnlResponse | null>(() => {
    const state = this.pnl.hasValue() ? this.pnl.value() : null;
    return state?.status === 'priced' ? state.pnl : null;
  });
  readonly pnlUnavailable = computed(() => (this.pnl.hasValue() ? this.pnl.value().status === 'unavailable' : false));
  readonly pnlErrorMessage = computed(() => {
    const error = this.pnl.error();
    return error ? describeError(error) : '';
  });

  // ---------------------------------------------------------------- performance

  /** The benchmark compared with the curve: a configured symbol, or empty for none. */
  readonly benchmark = signal('');
  private readonly historyPolls = signal(0);

  readonly performance = resource({
    params: () => {
      const accountId = this.accountId();
      return accountId === null ? undefined : { accountId, benchmark: this.benchmark() };
    },
    loader: ({ params }) => firstValueFrom(this.api.performance(params.accountId, { benchmark: params.benchmark })),
  });

  /** The closed-day history, or null while it is loading, being built, or could not be read. */
  readonly history = computed<PerformanceResponse | null>(() => {
    if (!this.performance.hasValue()) {
      return null;
    }
    const answer = this.performance.value();
    return isBuilding(answer) ? null : answer;
  });
  /** The history is being built for the first time (HTTP 202). */
  readonly historyBuilding = computed(() => this.performance.hasValue() && isBuilding(this.performance.value()));
  readonly historyErrorMessage = computed(() => {
    const error = this.performance.error();
    return error ? describeError(error) : '';
  });

  constructor() {
    // While the first build is under way, ask again shortly, a bounded number of times; the nightly job keeps it current after.
    effect((onCleanup) => {
      if (!this.historyBuilding() || this.performance.isLoading() || this.historyPolls() >= HISTORY_MAX_POLLS) {
        return;
      }
      const timer = setTimeout(() => {
        this.historyPolls.update((n) => n + 1);
        this.performance.reload();
      }, HISTORY_POLL_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  // ---------------------------------------------------------------- actions

  /** Only the profit-and-loss section reloads. */
  setRealisedRange(from: string, to: string): void {
    this.from.set(from);
    this.to.set(to);
  }

  /** Only the performance section reloads. */
  setBenchmark(symbol: string): void {
    this.benchmark.set(symbol);
  }

  /** Reads everything again (the Refresh button, and the minute timer). */
  reload(): void {
    this.data.reload();
    this.pnl.reload();
    this.performance.reload();
  }

  reloadPnl(): void {
    this.pnl.reload();
  }

  reloadHistory(): void {
    this.historyPolls.set(0);
    this.performance.reload();
  }

  /**
   * Reads the portfolio again every {@link PORTFOLIO_REFRESH_MS} until the returned function is called. The page starts it
   * while it is open and stops it when it closes, so nothing polls in the background.
   */
  autoRefresh(): () => void {
    const timer = setInterval(() => this.reload(), PORTFOLIO_REFRESH_MS);
    return () => clearInterval(timer);
  }

  /** Realised needs no price. If this fails too the page simply has no realised figure to show. */
  private async realisedAlone(accountId: number): Promise<RealisedPnlResponse | null> {
    try {
      return await firstValueFrom(this.api.realised(accountId));
    } catch {
      return null;
    }
  }
}
