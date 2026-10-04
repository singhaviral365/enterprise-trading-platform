import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../api/api.config';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { SessionService } from '../../core/session.service';
import { HIGHCHARTS_LOADER } from '../../shared/ui/donut-chart/highcharts-loader';
import {
  LINK_URL,
  TEST_TOKENS,
  answerLinkedAccount,
  answerUnlinkedAccount,
  orderEntry,
} from '../../testing/trade-http';
import { Dashboard, OTHER_SLICE } from './dashboard';

const position = (symbol: string, quantity: number, averageCost: number) => ({
  accountId: 1001,
  symbol,
  instrumentName: `${symbol} Inc.`,
  iconUrl: null,
  quantity,
  averageCost,
});

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let chart: ReturnType<typeof vi.fn>;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);
  type ChartOptions = { chart: { type: string }; series: Array<{ data: unknown[] }> };
  /** The options of the chart of one kind ('pie' donut, 'area' line) that was drawn, if any. */
  const drawn = (type: string) =>
    chart.mock.calls
      .map((call) => call[1] as ChartOptions)
      .find((options) => options.chart.type === type);
  const chartData = () => drawn('pie')!.series[0].data as Array<{ name: string; y: number }>;

  beforeEach(async () => {
    chart = vi.fn(() => ({ series: [{ setData: vi.fn() }], destroy: vi.fn() }));
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        { provide: HIGHCHARTS_LOADER, useValue: () => Promise.resolve({ chart }) },
      ],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(Dashboard);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('shows a spinner while the account loads', async () => {
    await vi.waitFor(() => fixture.detectChanges());

    expect(root.querySelector('[data-testid="dashboard-title"]')?.textContent).toContain(
      'Dashboard',
    );
    expect(root.textContent).toContain('Loading your account');
    await answerUnlinkedAccount(http);
  });

  it('invites a user with no account to open one, and shows no account panels', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();

    expect(byTestId('dashboard-no-account')).toBeTruthy();
    expect(byTestId('dashboard-cash-balance')).toBeNull();
    expect(byTestId('donut-chart')).toBeNull();
    expect(byTestId('growth-empty')).toBeNull();
    expect(byTestId('line-chart')).toBeNull();

    byTestId<HTMLButtonElement>('dashboard-open-account')!.click();
    const dialogs = TestBed.inject(AuthDialogService);
    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('account');
  });

  it('keeps live market data off the dashboard (it has its own page)', async () => {
    await answerLinkedAccount(http);
    await fixture.whenStable();

    expect(root.querySelector('app-market-board')).toBeNull();
    expect(root.querySelector('[data-testid="market-table"]')).toBeNull();
  });

  it('summarises the account: cash, invested at cost and open orders', async () => {
    await answerLinkedAccount(http, {
      cashBalance: 24800,
      positions: [position('AAPL', 10, 100), position('MSFT', 5, 200)],
      orders: [
        orderEntry('1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z'),
        orderEntry('2', 'MSFT', 'REJECTED', '2026-09-29T10:00:00Z'),
        orderEntry('3', 'TSLA', 'NEW', '2026-10-01T09:00:00Z'),
      ],
    });
    await fixture.whenStable();

    expect(byTestId('dashboard-cash-balance')?.textContent).toContain('$24,800.00');
    const stats = Array.from(root.querySelectorAll('.stat')).map(
      (s) => s.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
    expect(stats).toHaveLength(5);
    expect(stats.some((s) => s.includes('Invested (at cost)') && s.includes('$2,000.00'))).toBe(
      true,
    );
    expect(stats.some((s) => s.includes('Open orders') && s.includes('1'))).toBe(true);
    expect(stats.some((s) => s.includes('Positions') && s.includes('2'))).toBe(true);
    expect(stats.some((s) => s.includes('Total orders') && s.includes('3'))).toBe(true);
    expect(byTestId('positions-link')?.getAttribute('href')).toBe('/positions');
    expect(byTestId('total-orders-link')?.getAttribute('href')).toBe('/orders');
    // Open orders opens the history already filtered to Working (status NEW).
    expect(byTestId('open-orders-link')?.getAttribute('href')).toBe('/orders?status=NEW');
    expect(byTestId('dashboard-status-notice')).toBeNull();
  });

  describe('investments donut', () => {
    it('charts the holdings by cost with the total in the middle and a link to the positions page', async () => {
      await answerLinkedAccount(http, {
        positions: [position('AAPL', 10, 100), position('MSFT', 5, 200), position('TSLA', 1, 50)],
      });
      await fixture.whenStable();
      await vi.waitFor(() => expect(drawn('pie')).toBeDefined());

      expect(chartData()).toEqual([
        { name: 'AAPL', y: 1000, colorIndex: 0 },
        { name: 'MSFT', y: 1000, colorIndex: 1 },
        { name: 'TSLA', y: 50, colorIndex: 2 },
      ]);
      expect(byTestId('donut-center-value')?.textContent).toBe('$2,050.00');
      expect(root.querySelector('.donut-center-label')?.textContent).toBe('Invested');
      expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
        'totalling $2,050.00',
      );
      expect(byTestId('positions-view-more')?.getAttribute('href')).toBe('/positions');
      expect(root.querySelector('[data-testid="donut-legend"]')?.textContent).toContain(
        'AAPL Inc.',
      );
    });

    it('sorts the biggest holding first and groups the smallest into Other once the colours run out', async () => {
      const many = Array.from({ length: 12 }, (_, i) =>
        position(`S${String(i).padStart(2, '0')}`, i + 1, 10),
      );
      await answerLinkedAccount(http, { positions: many });
      await fixture.whenStable();
      await vi.waitFor(() => expect(drawn('pie')).toBeDefined());

      const data = chartData();
      expect(data).toHaveLength(10);
      expect(data[0].name).toBe('S11');
      expect(data[9].name).toBe(OTHER_SLICE);
      // the three smallest: (1 + 2 + 3) x 10
      expect(data[9].y).toBe(60);
    });

    it('invites the user to find an instrument when nothing is held', async () => {
      await answerLinkedAccount(http, { positions: [] });
      await fixture.whenStable();

      expect(byTestId('allocation-empty')?.textContent).toContain("don't hold any investments");
      expect(byTestId('allocation-find')?.getAttribute('href')).toBe('/market');
      expect(byTestId('donut-chart')).toBeNull();
      expect(drawn('pie')).toBeUndefined();
    });
  });

  describe('invested over time', () => {
    const fill = (
      id: string,
      symbol: string,
      side: string,
      quantity: number,
      price: number,
      createdOn: string,
    ) => ({
      ...orderEntry(id, symbol, 'FILLED', createdOn, side),
      quantity,
      executedPrice: price,
    });

    it('charts the cost of the holdings after each filled order, in step with the Invested card', async () => {
      await answerLinkedAccount(http, {
        positions: [position('AAPL', 5, 100)],
        orders: [
          fill('1', 'AAPL', 'BUY', 10, 100, '2026-09-01T10:00:00Z'),
          fill('2', 'AAPL', 'SELL', 5, 150, '2026-09-10T10:00:00Z'),
        ],
      });
      await fixture.whenStable();
      await vi.waitFor(() => expect(drawn('area')).toBeDefined());

      const data = drawn('area')!.series[0].data as Array<[number, number]>;
      expect(data.slice(0, 2).map(([, value]) => value)).toEqual([1000, 500]);
      // carried to now at the last value, which is also what the Invested card says
      expect(data[data.length - 1][1]).toBe(500);
      expect(root.textContent).toContain('$500.00');
      expect(root.querySelector('#growth-title')?.textContent).toContain('Investments Over Time');
      expect(
        root.querySelector('[data-testid="line-chart"] [role="img"]')?.getAttribute('aria-label'),
      ).toContain('now $500.00');
    });

    it('invites the user to trade while there is no filled order yet', async () => {
      await answerLinkedAccount(http, {
        orders: [orderEntry('1', 'AAPL', 'REJECTED', '2026-09-01T10:00:00Z')],
      });
      await fixture.whenStable();

      expect(byTestId('growth-empty')?.textContent).toContain(
        'starts with your first filled order',
      );
      expect(byTestId('line-chart')).toBeNull();
    });
  });

  it('lists recent orders newest first, capped at five, with the instrument and a link to the full history', async () => {
    const orders = Array.from({ length: 7 }, (_, i) =>
      orderEntry(
        `o${i}`,
        `SYM${i}`,
        'FILLED',
        `2026-09-0${i + 1}T10:00:00Z`,
        i % 2 ? 'SELL' : 'BUY',
      ),
    );
    await answerLinkedAccount(http, { orders });
    await fixture.whenStable();

    const symbols = Array.from(root.querySelectorAll('.simple-table tbody .label-symbol')).map(
      (t) => t.textContent?.trim(),
    );
    expect(symbols).toEqual(['SYM6', 'SYM5', 'SYM4', 'SYM3', 'SYM2']);
    expect(root.querySelector('.simple-table tbody .label-name')?.textContent).toContain(
      'SYM6 Inc.',
    );
    expect(byTestId('orders-view-more')?.getAttribute('href')).toBe('/orders');
  });

  it('says so when there are no orders yet', async () => {
    await answerLinkedAccount(http);
    await fixture.whenStable();

    expect(root.textContent).toContain("You haven't placed any orders yet.");
    expect(byTestId('orders-view-more')).toBeNull();
  });

  it('warns that a suspended account cannot trade', async () => {
    await answerLinkedAccount(http, { status: 'SUSPENDED' });
    await fixture.whenStable();

    expect(byTestId('dashboard-status-notice')?.textContent).toContain('suspended');
  });

  it('reports a failed account load with a retry', async () => {
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush(null, {
      status: 500,
      statusText: 'x',
    });
    await fixture.whenStable();

    expect(byTestId('dashboard-error')).toBeTruthy();

    byTestId<HTMLButtonElement>('dashboard-error')!.querySelector('button')!.click();
    await answerLinkedAccount(http);
    await fixture.whenStable();
    expect(byTestId('dashboard-error')).toBeNull();
    expect(byTestId('dashboard-cash-balance')).toBeTruthy();
  });
});
