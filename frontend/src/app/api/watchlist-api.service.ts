import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  PriceAlertsService,
  SetAlertRequest,
  Watchlist,
  WatchlistItemsService,
  WatchlistsService,
} from './generated/watchlist';

/**
 * App-facing wrapper over the generated Watchlist clients (the watchlist module of the Trade REST API).
 * The generated services expose observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class WatchlistApi {
  private readonly watchlists = inject(WatchlistsService);
  private readonly items = inject(WatchlistItemsService);
  private readonly alerts = inject(PriceAlertsService);

  list(accountId: number): Observable<Watchlist[]> {
    return this.watchlists.listWatchlists(accountId);
  }

  create(accountId: number, name: string): Observable<Watchlist> {
    return this.watchlists.createWatchlist(accountId, { name });
  }

  rename(accountId: number, watchlistId: number, name: string): Observable<Watchlist> {
    return this.watchlists.renameWatchlist(accountId, watchlistId, { name });
  }

  remove(accountId: number, watchlistId: number): Observable<unknown> {
    return this.watchlists.deleteWatchlist(accountId, watchlistId);
  }

  addItem(accountId: number, watchlistId: number, tickerSymbol: string): Observable<Watchlist> {
    return this.items.addWatchlistItem(accountId, watchlistId, { tickerSymbol });
  }

  removeItem(accountId: number, watchlistId: number, tickerSymbol: string): Observable<Watchlist> {
    return this.items.removeWatchlistItem(accountId, watchlistId, tickerSymbol);
  }

  /** Arms (or replaces) the entry's price alert. */
  setAlert(accountId: number, watchlistId: number, tickerSymbol: string, alert: SetAlertRequest): Observable<Watchlist> {
    return this.alerts.setPriceAlert(accountId, watchlistId, tickerSymbol, alert);
  }

  clearAlert(accountId: number, watchlistId: number, tickerSymbol: string): Observable<Watchlist> {
    return this.alerts.clearPriceAlert(accountId, watchlistId, tickerSymbol);
  }
}
