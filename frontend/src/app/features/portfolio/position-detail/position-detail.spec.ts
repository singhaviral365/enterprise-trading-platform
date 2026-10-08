import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';

import { provideApiClients } from '../../../api/api.config';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { MarketService } from '../../../core/market.service';
import { HIGHCHARTS_LOADER, HIGHCHARTS_MODULE_LOADER } from '../../../shared/ui/donut-chart/highcharts-loader';
import { PositionRow } from '../position-row';
import { PositionDetail } from './position-detail';

const POSITION: PositionRow = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  iconUrl: null,
  quoteCurrency: 'USD',
  quantity: 50,
  averageCost: 172,
  costBasis: 8600,
  pricing: null,
};

const CANDLES = {
  symbol: 'AAPL',
  currency: 'USD',
  interval: '1d',
  candles: [
    { date: '2026-09-01', open: 170, high: 176, low: 168, close: 174, volume: 1000, synthetic: false },
    { date: '2026-09-02', open: 174, high: 180, low: 172, close: 178, volume: 1200, synthetic: false },
  ],
};

const order = (id: string, side: string, price: number, createdOn: string, status = 'FILLED') => ({
  orderId: id,
  accountId: 1001,
  symbol: 'AAPL',
  instrumentName: 'Apple Inc.',
  side,
  orderPricingType: 'MARKET',
  quantity: 20,
  executedPrice: price,
  status,
  createdOn,
});

describe('PositionDetail: the chart of the price and your trades', () => {
  let fixture: ComponentFixture<PositionDetail>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let stockChart: ReturnType<typeof vi.fn>;
  let currency: ReturnType<typeof signal<string>>;

  const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  async function create(currencyCode = 'USD'): Promise<void> {
    currency = signal(currencyCode);
    stockChart = vi.fn(() => ({ destroy: vi.fn() }));
    await TestBed.configureTestingModule({
      imports: [PositionDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart: stockChart, stockChart }) },
        { provide: HIGHCHARTS_MODULE_LOADER, useValue: () => Promise.resolve() },
        {
          provide: AccountOverviewStore,
          useValue: {
            linked: () => ({
              overview: {
                orders: [
                  order('1', 'BUY', 170, '2026-09-01T15:00:00Z'),
                  order('2', 'SELL', 178, '2026-09-02T10:00:00Z'),
                  order('3', 'BUY', 99, '2026-09-02T11:00:00Z', 'REJECTED'),
                ],
              },
            }),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PositionDetail);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('position', POSITION);
    fixture.componentRef.setInput('currency', currency());
  }

  const answerCandles = async (body: object | null = CANDLES) => {
    const request = await vi.waitFor(() => http.expectOne('/api/v1/market/candles/AAPL'));
    if (body) {
      request.flush(body);
    } else {
      request.flush('down', { status: 503, statusText: 'x' });
    }
    await fixture.whenStable();
  };

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('says it is loading, then draws candles with the average cost and the filled trades marked', async () => {
    await create();
    fixture.detectChanges();
    expect(byTestId('position-chart-loading')).not.toBeNull();

    await answerCandles();
    await vi.waitFor(() => expect(stockChart).toHaveBeenCalled());

    const drawn = stockChart.mock.calls[0][1] as Options;
    const line = (drawn.yAxis as { plotLines: { value: number }[] }[])[0].plotLines[0];
    expect(line.value).toBe(172);
    const trades = (drawn.series as { data: { className: string; y: number }[] }[])[2].data;
    expect(trades.map((t) => [t.className, t.y])).toEqual([
      ['candle-buy', 170],
      ['candle-sell', 178],
    ]);
    expect(byTestId('position-chart')?.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('2 of your trades marked');
  });

  it('says so, in a sentence, when the history cannot be loaded or there is none', async () => {
    await create();
    await answerCandles(null);

    expect(byTestId('position-chart-error')?.textContent).toContain('unavailable');
    expect(byTestId('candle-chart')).toBeNull();
  });

  it('says there is no price history for an instrument with no candles', async () => {
    await create();
    await answerCandles({ ...CANDLES, candles: [] });

    expect(byTestId('position-chart-none')).not.toBeNull();
  });

  it('converts the average cost and the trades into the currency the chart is drawn in', async () => {
    await create('EUR');
    TestBed.inject(MarketService)['latestRates'].set({ base: 'USD', rates: { USD: 1, EUR: 0.5 } });
    fixture.detectChanges();

    await answerCandles();
    await vi.waitFor(() => expect(stockChart).toHaveBeenCalled());

    // 172 EUR at 0.5 EUR per USD is 344 USD; a 170 EUR fill is 340 USD.
    const drawn = stockChart.mock.calls[stockChart.mock.calls.length - 1][1] as Options;
    expect((drawn.yAxis as { plotLines: { value: number }[] }[])[0].plotLines[0].value).toBe(344);
    expect((drawn.series as { data: { y: number }[] }[])[2].data[0].y).toBe(340);
  });
});
