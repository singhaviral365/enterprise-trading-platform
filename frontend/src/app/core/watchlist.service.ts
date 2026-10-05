import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { TRADE_API_URL } from './api.config';
import { errorCodeOf } from './errors/describe-error';

/** Per-account caps enforced by the Trade API (watchlist.limits.*); the UI disables controls at them. */
export const MAX_WATCHLISTS = 10;
export const MAX_ITEMS_PER_WATCHLIST = 50;
export const MAX_NAME_LENGTH = 100;
export const MAX_TICKER_LENGTH = 20;

/** LIVE: fresh quote. STALE: older than the backend's threshold. UNAVAILABLE: no quote consumed yet. */
export type PriceStatus = 'LIVE' | 'STALE' | 'UNAVAILABLE';

export interface WatchlistItem {
  readonly tickerSymbol: string;
  readonly addedAt: string;
  readonly price: number | null;
  readonly quotedAt: string | null;
  readonly priceStatus: PriceStatus;
}

export interface Watchlist {
  readonly watchlistId: number;
  readonly accountId: number;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly WatchlistItem[];
}

/** Error thrown by `WatchlistService`; `message` is safe to show to the user as-is. */
export class WatchlistError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The contract's errorCode (e.g. WLI-409), when the response carried one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'WatchlistError';
  }
}

/**
 * Sentences for the watchlist's own codes. Kept here rather than in the shared error map, which is typed
 * from the generated contracts and uses ACC-403 to mean "account not active" (here it means "not your account").
 */
const MESSAGES_BY_CODE: Readonly<Record<string, string>> = {
  'AUTH-401': 'Your session has expired. Please sign in again.',
  'ACC-403': 'This account does not belong to your login.',
  'ACC-404': 'We could not find your trading account.',
  'INS-404': 'That symbol is not available for trading. Check the ticker and try again.',
  'VAL-422': 'Please check what you entered and try again.',
  'WTL-404': 'That watchlist no longer exists. It may have been deleted.',
  'WTL-409': 'You already have a watchlist with that name.',
  'WTL-422': `You can have at most ${MAX_WATCHLISTS} watchlists. Delete one to add another.`,
  'WLI-404': 'That stock is not on this watchlist.',
  'WLI-409': 'That stock is already on this watchlist.',
  'WLI-422': `A watchlist can hold at most ${MAX_ITEMS_PER_WATCHLIST} stocks. Remove one to add another.`,
};

/** The customer's watchlists, with the latest price the backend holds for each stock. */
@Service()
export class WatchlistService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(TRADE_API_URL);

  async list(accountId: number): Promise<Watchlist[]> {
    return this.call(this.http.get<Watchlist[]>(this.url(accountId)));
  }

  async create(accountId: number, name: string): Promise<Watchlist> {
    return this.call(this.http.post<Watchlist>(this.url(accountId), { name }));
  }

  async rename(accountId: number, watchlistId: number, name: string): Promise<Watchlist> {
    return this.call(this.http.patch<Watchlist>(`${this.url(accountId)}/${watchlistId}`, { name }));
  }

  async remove(accountId: number, watchlistId: number): Promise<void> {
    await this.call(this.http.delete<void>(`${this.url(accountId)}/${watchlistId}`));
  }

  async addItem(accountId: number, watchlistId: number, tickerSymbol: string): Promise<Watchlist> {
    return this.call(this.http.post<Watchlist>(`${this.url(accountId)}/${watchlistId}/items`, { tickerSymbol }));
  }

  async removeItem(accountId: number, watchlistId: number, tickerSymbol: string): Promise<Watchlist> {
    return this.call(
      this.http.delete<Watchlist>(`${this.url(accountId)}/${watchlistId}/items/${encodeURIComponent(tickerSymbol)}`),
    );
  }

  private url(accountId: number): string {
    return `${this.baseUrl}/accounts/${accountId}/watchlists`;
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toWatchlistError(error);
    }
  }
}

export function toWatchlistError(error: unknown): WatchlistError {
  if (!(error instanceof HttpErrorResponse)) {
    return new WatchlistError('Something went wrong. Please try again.', -1);
  }
  const code = errorCodeOf(error);
  const known = code ? MESSAGES_BY_CODE[code] : undefined;
  if (known) {
    return new WatchlistError(known, error.status, code);
  }
  switch (error.status) {
    case 0:
    case 502:
    case 503:
    case 504:
      return new WatchlistError('Cannot reach the trading service. Please try again shortly.', error.status, code);
    case 401:
      return new WatchlistError(MESSAGES_BY_CODE['AUTH-401'], 401, code);
    case 403:
      return new WatchlistError(MESSAGES_BY_CODE['ACC-403'], 403, code);
    default:
      return new WatchlistError('The trading service is having trouble right now. Please try again later.', error.status, code);
  }
}
