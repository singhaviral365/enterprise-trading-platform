import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import type { MarketRow } from '../../../core/market-row';
import { MarketService } from '../../../core/market.service';
import { SessionService } from '../../../core/session.service';
import { QUOTES_URL, TEST_TOKENS, answerLinkedAccount } from '../../../testing/trade-http';
import { QuoteSummary } from './quote-summary';

const ROW: MarketRow = {
  quote: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: 'EQUITY',
    price: 200,
    details: { currency: 'USD', asOf: '2026-10-01T10:00:00Z' },
  },
  change: 1.5,
  changePercent: 0.75,
  previousClose: 198.5,
  currency: 'USD',
};

describe('QuoteSummary', () => {
  let fixture: ComponentFixture<QuoteSummary>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function show(row: MarketRow): Promise<void> {
    fixture.componentRef.setInput('row', row);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [QuoteSummary],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(QuoteSummary);
    root = fixture.nativeElement as HTMLElement;
  });

  it('shows the symbol, name, asset class, price, move, previous close and date', async () => {
    await show(ROW);

    expect(root.querySelector('#detail-title')?.textContent).toContain('AAPL');
    expect(root.querySelector('.quote-subtitle')?.textContent).toContain('Apple Inc.');
    expect(root.querySelector('.asset-chip')?.textContent).toContain('EQUITY');
    expect(byTestId('quote-price')?.textContent).toContain('$200.00');
    expect(root.querySelector('.quote-move')?.textContent).toContain('+1.50');
    expect(root.querySelector('.quote-move')?.textContent).toContain('+0.75%');
    expect(byTestId('quote-previous-close')?.textContent).toContain('$198.50');
    expect(byTestId('quote-date')?.getAttribute('datetime')).toBe('2026-10-01T10:00:00Z');
    expect(root.querySelector('.quote-summary')?.classList.contains('is-up')).toBe(true);
  });

  it('copes with a missing quote, date and previous close', async () => {
    await show({
      quote: {
        symbol: 'NVDA',
        name: null,
        assetClass: null,
        price: null,
        details: { asOf: 'not a date' },
      },
      change: null,
      changePercent: null,
      previousClose: null,
      currency: null,
    });

    expect(byTestId('quote-price')?.textContent).toContain('No live quote');
    expect(byTestId('quote-date')).toBeNull();
    expect(byTestId('quote-previous-close')).toBeNull();
    expect(root.querySelector('.quote-move')).toBeNull();
    expect(root.querySelector('.quote-subtitle')?.textContent).toContain('Instrument');
  });

  it('shows a falling instrument as down and a plain number without a currency', async () => {
    await show({ ...ROW, change: -2, changePercent: -1, currency: null, previousClose: 202 });

    expect(root.querySelector('.quote-summary')?.classList.contains('is-down')).toBe(true);
    expect(byTestId('quote-price')?.textContent).toContain('200.00');
    expect(byTestId('quote-previous-close')?.textContent).toContain('202.00');
  });

  it('shows what the price is in the account currency for an instrument quoted in another one', async () => {
    fixture.componentRef.setInput('row', {
      ...ROW,
      quote: { ...ROW.quote, price: 1100 },
      currency: 'INR',
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionService).start('alice', TEST_TOKENS);
    await answerLinkedAccount(http);
    const loading = TestBed.inject(MarketService).getBoard();
    http.expectOne(QUOTES_URL).flush({
      quotes: [],
      asOf: '2026-10-04T05:00:00Z',
      stale: false,
      baseCurrency: 'USD',
      fxRates: { USD: 1, INR: 100 },
    });
    await loading;

    await show({ ...ROW, quote: { ...ROW.quote, price: 1100 }, currency: 'INR' });

    expect(byTestId('quote-equivalent')?.textContent).toContain('≈ $11.00');
  });

  it('asks to be closed from the close button', async () => {
    await show(ROW);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byTestId<HTMLButtonElement>('quote-close')!.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
