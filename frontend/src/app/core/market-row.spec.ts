import { MarketQuote } from './market.service';
import { toMarketRow } from './market-row';

const quote = (overrides: Partial<MarketQuote> = {}): MarketQuote => ({
  symbol: 'INFY.NS',
  name: 'Infosys Ltd',
  assetClass: 'EQUITY',
  price: 1100,
  details: { change: 5, changePercent: 0.45, previousClose: 1095 },
  ...overrides,
});

describe('toMarketRow', () => {
  it('reads change, percent change and previous close out of the details', () => {
    const row = toMarketRow(quote());

    expect(row).toMatchObject({ change: 5, changePercent: 0.45, previousClose: 1095 });
  });

  it('prefers the currency the quote API reported', () => {
    expect(toMarketRow(quote({ details: { currency: 'usd' }, currency: 'INR' })).currency).toBe(
      'USD',
    );
  });

  it('falls back to the instrument currency the executor attaches', () => {
    expect(toMarketRow(quote({ currency: 'INR' })).currency).toBe('INR');
  });

  it('has no currency when neither is a three-letter code', () => {
    expect(
      toMarketRow(quote({ details: { currency: 'dollars' }, currency: null })).currency,
    ).toBeNull();
    expect(toMarketRow(quote({ details: null })).currency).toBeNull();
  });
});
