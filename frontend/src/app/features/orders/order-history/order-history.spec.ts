import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import { ORDER_POLL, OrderHistory } from './order-history';

const BASE = '/api/v1/accounts/1001';
const ORDERS_URL = `${BASE}/orders`;

function entry(orderId: string, symbol: string, status: string, createdOn: string) {
  return {
    orderId,
    accountId: 1001,
    symbol,
    side: 'BUY',
    orderPricingType: 'MARKET',
    quantity: 5,
    price: null,
    executedPrice: status === 'FILLED' ? 100 : null,
    status,
    createdOn,
  };
}

describe('OrderHistory', () => {
  let fixture: ComponentFixture<OrderHistory>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const rowSymbols = () =>
    Array.from(root.querySelectorAll('[data-testid="order-row"]')).map((row) => row.querySelector('th')?.textContent?.trim());
  const render = () => vi.waitFor(() => fixture.detectChanges());
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** The component reads the linked account from the shared store, then loads its own order list. */
  async function start(orders: unknown[]): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({
      linked: true,
      message: 'Linked account found',
      accountNumber: 'ACC000001001',
    });
    (await vi.waitFor(() => http.expectOne(BASE))).flush({
      id: 1001,
      accountId: 'ACC000001001',
      holderName: 'USER-1000',
      cashBalance: 25000,
      status: 'ACTIVE',
      version: 1,
      lastUpdated: '2026-10-01T00:00:00Z',
    });
    http.expectOne(`${BASE}/balance`).flush({ accountId: 1001, cashBalance: 25000, currency: 'USD', asOf: '' });
    http.expectOne(`${BASE}/positions`).flush([]);
    http.expectOne(ORDERS_URL).flush([]);
    (await vi.waitFor(() => http.expectOne(ORDERS_URL))).flush(orders);
    await render();
  }

  /** Answers the next re-read of the order list. */
  async function answerReread(orders: unknown[]): Promise<void> {
    (await vi.waitFor(() => http.expectOne(ORDERS_URL))).flush(orders);
    await render();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrderHistory],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        { provide: ORDER_POLL, useValue: { intervalMs: 20, maxPolls: 2 } },
      ],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    fixture = TestBed.createComponent(OrderHistory);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('lists orders newest first, rejections included, each badge carrying its word', async () => {
    await start([
      entry('a1', 'OLD', 'FILLED', '2026-09-01T10:00:00Z'),
      entry('b2', 'NEWEST', 'REJECTED', '2026-09-30T10:00:00Z'),
      entry('c3', 'MIDDLE', 'CANCELLED', '2026-09-15T10:00:00Z'),
    ]);

    expect(rowSymbols()).toEqual(['NEWEST', 'MIDDLE', 'OLD']);
    const badges = Array.from(root.querySelectorAll('[data-testid="order-status"]')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(['Rejected', 'Cancelled', 'Filled']);
  });

  it('shows an order at NEW as still working', async () => {
    await start([entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')]);

    expect(byTestId('order-status')?.textContent).toContain('Working');
    expect(byTestId('orders-live-status')?.textContent).toContain('still working');
    // Wind the poll down so no timer outlives the test.
    await answerReread([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
  });

  it('stops re-reading once nothing is at NEW, and never re-posts an order', async () => {
    await start([entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')]);

    await answerReread([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
    expect(byTestId('order-status')?.textContent).toContain('Filled');

    await sleep(120);
    http.expectNone(ORDERS_URL);
    http.expectNone({ method: 'POST', url: '/api/v1/orders' });
  });

  it('pauses after its allowance when an order stays at NEW, and Refresh reads again', async () => {
    const working = [entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')];
    await start(working);
    await answerReread(working);
    await answerReread(working);

    await sleep(120);
    http.expectNone(ORDERS_URL);
    expect(byTestId('orders-live-status')?.textContent).toContain('paused');

    byTestId<HTMLButtonElement>('orders-refresh')!.click();
    await answerReread([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
    expect(byTestId('order-status')?.textContent).toContain('Filled');
  });

  it('handles an empty history gracefully', async () => {
    await start([]);

    expect(byTestId('orders-empty')?.textContent).toContain("haven't placed any orders");
    expect(root.querySelector('table')).toBeNull();
    await sleep(120);
    http.expectNone(ORDERS_URL);
  });
});
