import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';
import { provideApiClients } from '../../../api/api.config';
import type { MarketRow } from '../../../core/market-row';
import { HIGHCHARTS_LOADER } from '../../../shared/ui/donut-chart/highcharts-loader';
import { QuoteDetail } from './quote-detail';

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

describe('QuoteDetail', () => {
  let fixture: ComponentFixture<QuoteDetail>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  /** Answers the detail's price-history request; null when no request is expected (same symbol). */
  type Respond = ((request: TestRequest) => void) | null;
  const noHistory: Respond = (request) =>
    request.flush({ symbol: 'AAPL', currency: 'USD', interval: '1d', candles: [] });

  async function show(row: MarketRow, respond: Respond = noHistory): Promise<void> {
    fixture.componentRef.setInput('row', row);
    if (respond) {
      respond(await vi.waitFor(() => http.expectOne(`/api/v1/market/candles/${row.quote.symbol}`)));
    }
    await fixture.whenStable();
  }

  let http: HttpTestingController;
  let chart: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    chart = vi.fn(() => ({ destroy: vi.fn(), series: [{ setData: vi.fn() }] }));
    await TestBed.configureTestingModule({
      imports: [QuoteDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(QuoteDetail);
    root = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
  });

  it('opens on the price card with the price chart (loading) and Buy / Sell', async () => {
    fixture.componentRef.setInput('row', ROW);
    const request = await vi.waitFor(() => http.expectOne('/api/v1/market/candles/AAPL'));

    expect(root.querySelector('#detail-title')?.textContent).toContain('AAPL');
    expect(byTestId('quote-price')?.textContent).toContain('$200.00');
    expect(byTestId('quote-chart')).toBeTruthy();
    expect(byTestId('quote-chart-status')?.textContent).toContain('Loading price history');
    expect(byTestId('quote-buy')).toBeTruthy();
    expect(byTestId('quote-sell')).toBeTruthy();
    expect(byTestId('order-ticket')).toBeNull();

    noHistory(request);
    await fixture.whenStable();
    expect(byTestId('quote-chart-status')?.textContent).toContain('No price history');
  });

  it('fetches a year of candles for the symbol and draws the closes, with the change over the year', async () => {
    await show(ROW, (request) =>
      request.flush({
        symbol: 'AAPL',
        currency: 'USD',
        interval: '1d',
        candles: [
          { date: '2025-10-06', open: 1, high: 1, low: 1, close: 200, volume: 10, synthetic: false },
          { date: '2025-10-07', open: 1, high: 1, low: 1, close: 210, volume: null, synthetic: true },
          { date: '2026-10-05', open: 1, high: 1, low: 1, close: 250, volume: 12, synthetic: false },
        ],
      }),
    );

    expect(byTestId('line-chart')).toBeTruthy();
    expect(chart).toHaveBeenCalledTimes(1);
    const options = chart.mock.calls[0][1] as Options;
    expect((options.series?.[0] as { data: unknown }).data).toEqual([
      [Date.parse('2025-10-06T00:00:00Z'), 200],
      [Date.parse('2025-10-07T00:00:00Z'), 210],
      [Date.parse('2026-10-05T00:00:00Z'), 250],
    ]);
    expect(byTestId('quote-chart-change')?.textContent).toContain('+$50.00');
    expect(byTestId('quote-chart-change')?.textContent).toContain('+25.00%');
  });

  it('says so when the price history cannot be loaded', async () => {
    await show(ROW, (request) => request.flush('down', { status: 503, statusText: 'Service Unavailable' }));

    expect(byTestId('line-chart')).toBeNull();
    expect(byTestId('quote-chart-status')?.textContent).toContain('Live market data is unavailable');
  });

  it('does not refetch the history when only the price changes', async () => {
    await show(ROW);

    await show({ ...ROW, quote: { ...ROW.quote, price: 201 } }, null);
    http.expectNone('/api/v1/market/candles/AAPL');

    // a different symbol does fetch (show() expects and answers its request)
    await show({ ...ROW, quote: { ...ROW.quote, symbol: 'MSFT' } });
  });

  it.each([
    ['quote-buy', 'Place buy order'],
    ['quote-sell', 'Place sell order'],
  ])(
    '%s opens the shared buy / sell screen for that side: the price card and the order ticket',
    async (button, submitLabel) => {
      await show(ROW);

      byTestId<HTMLButtonElement>(button)!.click();
      await fixture.whenStable();

      expect(byTestId('order-ticket')).toBeTruthy();
      expect(byTestId('order-submit')?.textContent).toContain(submitLabel);
      // the price card stays on the second screen
      expect(root.querySelector('app-trade-panel app-quote-summary')).toBeTruthy();
      expect(byTestId('quote-price')?.textContent).toContain('$200.00');
      // and the chart and the first screen's buttons are gone
      expect(byTestId('quote-chart')).toBeNull();
      expect(byTestId('quote-buy')).toBeNull();
    },
  );

  it('goes back to the first screen from the ticket', async () => {
    await show(ROW);
    byTestId<HTMLButtonElement>('quote-buy')!.click();
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('order-back')!.click();
    await fixture.whenStable();

    expect(byTestId('order-ticket')).toBeNull();
    expect(byTestId('quote-buy')).toBeTruthy();
  });

  it('stays on the ticket when the same instrument gets a fresh price, but starts over for another one', async () => {
    await show(ROW);
    byTestId<HTMLButtonElement>('quote-sell')!.click();
    await fixture.whenStable();

    await show({ ...ROW, quote: { ...ROW.quote, price: 201 } }, null);
    expect(byTestId('order-ticket')).toBeTruthy();
    expect(byTestId('quote-price')?.textContent).toContain('$201.00');

    await show({ ...ROW, quote: { ...ROW.quote, symbol: 'MSFT' } });
    expect(byTestId('order-ticket')).toBeNull();
    expect(byTestId('quote-buy')).toBeTruthy();
  });

  it('asks to be closed from the close button on either screen', async () => {
    await show(ROW);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byTestId<HTMLButtonElement>('quote-close')!.click();
    byTestId<HTMLButtonElement>('quote-buy')!.click();
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('quote-close')!.click();

    expect(closed).toHaveBeenCalledTimes(2);
  });
});
