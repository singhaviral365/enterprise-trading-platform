export * from './watchlistItems.service';
import { WatchlistItemsService } from './watchlistItems.service';
export * from './watchlistItems.serviceInterface';
export * from './watchlists.service';
import { WatchlistsService } from './watchlists.service';
export * from './watchlists.serviceInterface';
export const APIS = [WatchlistItemsService, WatchlistsService];
