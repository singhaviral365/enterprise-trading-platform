import {
  CHANGE_FIELDS,
  CHANGE_PERCENT_FIELDS,
  CURRENCY_FIELDS,
  MarketQuote,
  PREVIOUS_CLOSE_FIELDS,
  quoteField,
  quoteNumber,
} from './market.service';

/** One instrument as the market board, quote dialog and order ticket show it. */
export interface MarketRow {
  readonly quote: MarketQuote;
  readonly change: number | null;
  readonly changePercent: number | null;
  /** Last session's closing price, from the quote's previousClose. */
  readonly previousClose: number | null;
  /** ISO code the prices are quoted in; null when unknown (prices then show as plain numbers). */
  readonly currency: string | null;
}

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

/** Reads the display fields out of a quote's details (the field names differ between quote APIs). */
export function toMarketRow(quote: MarketQuote): MarketRow {
  const fromDetails = quoteField(quote, CURRENCY_FIELDS);
  const candidate = typeof fromDetails === 'string' ? fromDetails : quote.currency;
  return {
    quote,
    change: quoteNumber(quote, CHANGE_FIELDS),
    changePercent: quoteNumber(quote, CHANGE_PERCENT_FIELDS),
    previousClose: quoteNumber(quote, PREVIOUS_CLOSE_FIELDS),
    currency:
      typeof candidate === 'string' && CURRENCY_CODE.test(candidate)
        ? candidate.toUpperCase()
        : null,
  };
}
