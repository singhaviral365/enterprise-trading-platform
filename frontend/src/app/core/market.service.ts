import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MARKET_API_URL } from './api.config';

/** One instrument with its latest Fauxnance quote (MarketQuote in the trade-executor). */
export interface MarketQuote {
  readonly symbol: string;
  readonly name: string | null;
  readonly assetClass: string | null;
  readonly price: number | null;
  /** Every field Fauxnance returned for the symbol, as-is; null when there was no quote. */
  readonly details: Readonly<Record<string, unknown>> | null;
  /** ISO code `price` is quoted in: the quote API's own currency, else the instrument's. */
  readonly currency?: string | null;
  /** Public path of the company logo, e.g. `/assets/icons/AAPL.svg`; null when the instrument has none. */
  readonly iconUrl?: string | null;
}

export interface MarketBoard {
  readonly quotes: readonly MarketQuote[];
  readonly asOf: string;
  /** True when the trade-executor could not refresh and is serving its last snapshot. */
  readonly stale: boolean;
  /** Currency the `fxRates` are relative to (USD); absent when the exchange rate service is unavailable. */
  readonly baseCurrency?: string | null;
  /** One unit of `baseCurrency` in every currency, from ExchangeRate-API (fetched by the backend only). */
  readonly fxRates?: Readonly<Record<string, number>> | null;
}

/** Exchange rates relative to a base currency, as published with the market board. */
export interface FxRates {
  readonly base: string;
  readonly rates: Readonly<Record<string, number>>;
}

/**
 * `amount` of `from` expressed in `to`, or null when the rates do not cover either currency. The
 * backend does the real conversion when an order settles; this is only for showing estimates.
 */
export function convertCurrency(rates: FxRates | null, amount: number, from: string, to: string): number | null {
  if (from === to) {
    return amount;
  }
  const fromRate = rates?.rates[from];
  const toRate = rates?.rates[to];
  return fromRate && toRate ? (amount / fromRate) * toRate : null;
}

/** One daily candle; `synthetic` candles are filled in by Fauxnance for days the market was closed. */
export interface PriceCandle {
  /** ISO date, `yyyy-MM-dd`. */
  readonly date: string;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number;
  readonly volume: number | null;
  readonly synthetic: boolean;
}

/** A year of daily candles for one symbol, oldest first (the trade-executor calls Fauxnance's /candles). */
export interface PriceHistory {
  readonly symbol: string;
  readonly currency: string | null;
  readonly interval: string;
  readonly candles: readonly PriceCandle[];
}

/** Error thrown by `MarketService`; `message` is safe to show to the user as-is. */
export class MarketError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

/** Live quotes from the trade-executor's market endpoint (it calls Fauxnance and caches ~30s). */
@Service()
export class MarketService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(MARKET_API_URL);
  private readonly latestRates = signal<FxRates | null>(null);

  /** The exchange rates from the most recent board that carried them; null until one has loaded. */
  readonly fxRates = this.latestRates.asReadonly();

  async getBoard(): Promise<MarketBoard> {
    try {
      const board = await firstValueFrom(this.http.get<MarketBoard>(`${this.baseUrl}/quotes`));
      if (board.baseCurrency && board.fxRates) {
        this.latestRates.set({ base: board.baseCurrency, rates: board.fxRates });
      }
      return board;
    } catch (error) {
      throw toMarketError(error);
    }
  }

  /** Daily closes for the past year, up to today. */
  async getPriceHistory(symbol: string): Promise<PriceHistory> {
    try {
      return await firstValueFrom(
        this.http.get<PriceHistory>(`${this.baseUrl}/candles/${encodeURIComponent(symbol)}`),
      );
    } catch (error) {
      throw toMarketError(error);
    }
  }
}

function toMarketError(error: unknown): MarketError {
  if (!(error instanceof HttpErrorResponse)) {
    return new MarketError('Something went wrong loading market data.', -1);
  }
  switch (error.status) {
    case 401:
      return new MarketError('Your session has expired. Please sign in again.', 401);
    case 0:
    case 502:
    case 503:
    case 504:
      return new MarketError('Live market data is unavailable right now. We will keep trying.', error.status);
    default:
      return new MarketError('Market data could not be loaded. Please try again.', error.status);
  }
}

/**
 * Picks the first present field from a quote's details, trying the names different quote APIs use
 * for the same thing (e.g. `changePercent` vs `changesPercentage`).
 */
export function quoteField(quote: MarketQuote, candidates: readonly string[]): unknown {
  if (!quote.details) {
    return undefined;
  }
  for (const key of candidates) {
    const value = quote.details[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/** Numeric value of a quote field (numbers or numeric strings), else null. */
export function quoteNumber(quote: MarketQuote, candidates: readonly string[]): number | null {
  const value = quoteField(quote, candidates);
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

export const CHANGE_FIELDS = ['change', 'priceChange', 'netChange', 'regularMarketChange', 'dayChange'] as const;
export const CHANGE_PERCENT_FIELDS = [
  'changePercent',
  'change_percent',
  'percentChange',
  'changesPercentage',
  'regularMarketChangePercent',
  'dayChangePercent',
] as const;
export const PREVIOUS_CLOSE_FIELDS = ['previousClose', 'previous_close', 'prevClose', 'regularMarketPreviousClose'] as const;
export const CURRENCY_FIELDS = ['currency', 'currencyCode'] as const;
