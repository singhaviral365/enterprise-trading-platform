import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import {
  CHANGE_FIELDS,
  MarketBoard,
  MarketError,
  MarketQuote,
  MarketService,
  quoteField,
  quoteNumber,
} from './market.service';

const QUOTES_URL = '/api/v1/market/quotes';
const BOARD: MarketBoard = {
  quotes: [{ symbol: 'AAPL', name: 'Apple', assetClass: 'EQUITY', price: 200, details: { change: 1 } }],
  asOf: '2026-10-01T10:00:00Z',
  stale: false,
};

describe('MarketService', () => {
  let service: MarketService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MarketService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the board from the market endpoint', async () => {
    const board = service.getBoard();
    http.expectOne(QUOTES_URL).flush(BOARD);

    await expect(board).resolves.toEqual(BOARD);
  });

  it.each([
    [401, /session has expired/],
    [502, /unavailable right now/],
    [503, /unavailable right now/],
    [504, /unavailable right now/],
    [500, /could not be loaded/],
    [404, /could not be loaded/],
  ])('turns HTTP %i into a sentence a trader can read', async (status, message) => {
    const board = service.getBoard();
    http.expectOne(QUOTES_URL).flush(null, { status, statusText: 'x' });

    const error = await board.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarketError);
    expect((error as MarketError).status).toBe(status);
    expect((error as MarketError).message).toMatch(message);
  });

  it('reports a network failure as unavailable', async () => {
    const board = service.getBoard();
    http.expectOne(QUOTES_URL).error(new ProgressEvent('error'));

    const error = (await board.catch((e: unknown) => e)) as MarketError;
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/unavailable right now/);
  });
});

describe('MarketService with a non-HTTP failure', () => {
  it('falls back to a generic error', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get: () => throwError(() => new Error('boom')) } }],
    });

    const error = (await TestBed.inject(MarketService)
      .getBoard()
      .catch((e: unknown) => e)) as MarketError;

    expect(error.status).toBe(-1);
    expect(error.message).toMatch(/Something went wrong/);
  });
});

describe('quote field helpers', () => {
  const quote = (details: Record<string, unknown> | null): MarketQuote => ({
    symbol: 'X',
    name: null,
    assetClass: null,
    price: 1,
    details,
  });

  it('returns the first candidate that is present', () => {
    expect(quoteField(quote({ priceChange: 2, netChange: 3 }), CHANGE_FIELDS)).toBe(2);
  });

  it('skips empty, null and missing candidates', () => {
    expect(quoteField(quote({ change: '', priceChange: null, netChange: 4 }), CHANGE_FIELDS)).toBe(4);
    expect(quoteField(quote({}), CHANGE_FIELDS)).toBeUndefined();
  });

  it('has nothing to offer when the quote has no details', () => {
    expect(quoteField(quote(null), CHANGE_FIELDS)).toBeUndefined();
    expect(quoteNumber(quote(null), CHANGE_FIELDS)).toBeNull();
  });

  it('reads numbers and numeric strings, and rejects anything else', () => {
    expect(quoteNumber(quote({ change: 1.5 }), CHANGE_FIELDS)).toBe(1.5);
    expect(quoteNumber(quote({ change: '2.25' }), CHANGE_FIELDS)).toBe(2.25);
    expect(quoteNumber(quote({ change: 'n/a' }), CHANGE_FIELDS)).toBeNull();
    expect(quoteNumber(quote({ change: true }), CHANGE_FIELDS)).toBeNull();
  });
});
