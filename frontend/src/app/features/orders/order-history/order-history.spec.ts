import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../../api/api.config';
import { ORDER_POLL } from '../../../core/order-poll';
import { DialogService } from '../../../core/dialog.service';
import { NotificationService } from '../../../core/notification.service';
import { SessionService } from '../../../core/session.service';
import { OrderHistory } from './order-history';

const BASE = '/api/v1/accounts/1001';
const ORDERS_URL = `${BASE}/orders`;
const POLL = { intervalMs: 20, maxPolls: 2 };

function entry(orderId: string, symbol: string, status: string, createdOn: string, side = 'BUY') {
  return {
    orderId,
    accountId: 1001,
    symbol,
    side,
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
  /** Lets the resource settle, then paints it. */
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Every read of the account starts with the link lookup, then fires four parallel requests; the order list is one. */
  async function answerAccountReads(orders: unknown[]): Promise<void> {
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
    http.expectOne(ORDERS_URL).flush(orders);
    await render();
  }

  async function start(orders: unknown[]): Promise<void> {
    await answerAccountReads(orders);
  }

  async function tick(testId: string, value: string): Promise<void> {
    const box = root.querySelector<HTMLInputElement>(`[data-testid="${testId}"] input[data-value="${value}"]`)!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
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
        { provide: ORDER_POLL, useValue: POLL },
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

  const MIXED = [
    entry('a1', 'OLD', 'FILLED', '2026-09-01T10:00:00Z'),
    entry('b2', 'NEWEST', 'REJECTED', '2026-09-30T10:00:00Z', 'SELL'),
    entry('c3', 'MIDDLE', 'CANCELLED', '2026-09-15T10:00:00Z'),
  ];

  it('lists orders newest first by default, rejections included, each badge carrying its word', async () => {
    await start(MIXED);

    expect(rowSymbols()).toEqual(['NEWEST', 'MIDDLE', 'OLD']);
    const badges = Array.from(root.querySelectorAll('[data-testid="order-status"]')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(['Rejected', 'Cancelled', 'Filled']);
    // No order id column, and Symbol is the second column.
    const headings = Array.from(root.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headings.slice(0, 3)).toEqual(['Placed', 'Symbol', 'Side']);
    expect(headings).not.toContain('Order');
  });

  it('sorts by Symbol and by Placed, flipping direction on a second click', async () => {
    await start(MIXED);

    byTestId<HTMLButtonElement>('sort-symbol')!.click();
    await render();
    expect(rowSymbols()).toEqual(['MIDDLE', 'NEWEST', 'OLD']);
    expect(root.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Symbol');

    byTestId<HTMLButtonElement>('sort-symbol')!.click();
    await render();
    expect(rowSymbols()).toEqual(['OLD', 'NEWEST', 'MIDDLE']);

    byTestId<HTMLButtonElement>('sort-placed')!.click();
    await render();
    expect(rowSymbols()).toEqual(['NEWEST', 'MIDDLE', 'OLD']);
  });

  it('filters by side and by status, and resets the filters', async () => {
    await start(MIXED);

    await tick('filter-side', 'SELL');
    expect(rowSymbols()).toEqual(['NEWEST']);

    byTestId<HTMLButtonElement>('filters-reset')!.click();
    await render();
    expect(rowSymbols()).toEqual(['NEWEST', 'MIDDLE', 'OLD']);

    await tick('filter-status', 'FILLED');
    await tick('filter-status', 'CANCELLED');
    expect(rowSymbols()).toEqual(['MIDDLE', 'OLD']);

    await tick('filter-side', 'SELL');
    expect(byTestId('orders-no-match')?.textContent).toContain('No orders match these filters.');
  });

  it('shows an order at NEW as still working', async () => {
    await start([entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')]);

    expect(byTestId('order-status')?.textContent).toContain('Working');
    expect(byTestId('orders-live-status')?.textContent).toContain('still working');
    // Wind the poll down so no timer outlives the test.
    await answerAccountReads([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
  });

  it('stops re-reading once nothing is at NEW, and never re-posts an order', async () => {
    await start([entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')]);

    await answerAccountReads([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
    expect(byTestId('order-status')?.textContent).toContain('Filled');

    await sleep(120);
    http.expectNone(ORDERS_URL);
    http.expectNone({ method: 'POST', url: '/api/v1/orders' });
  });

  it('pauses after its allowance when an order stays at NEW, and Refresh reads again', async () => {
    const working = [entry('a1', 'AAPL', 'NEW', '2026-09-30T10:00:00Z')];
    await start(working);
    await answerAccountReads(working);
    await answerAccountReads(working);

    await sleep(120);
    http.expectNone(ORDERS_URL);
    expect(byTestId('orders-live-status')?.textContent).toContain('paused');

    byTestId<HTMLButtonElement>('orders-refresh')!.click();
    await answerAccountReads([entry('a1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z')]);
    expect(byTestId('order-status')?.textContent).toContain('Filled');
  });

  it('handles an empty history gracefully', async () => {
    await start([]);

    expect(byTestId('orders-empty')?.textContent).toContain("haven't placed any orders");
    expect(root.querySelector('table')).toBeNull();
    await sleep(120);
    http.expectNone(ORDERS_URL);
  });
  describe('cancelling working orders', () => {
    // These orders stay at NEW; keep the background poll out of the way so each request is answered once.
    beforeEach(() => {
      POLL.intervalMs = 60_000;
    });
    afterEach(() => {
      POLL.intervalMs = 20;
    });

    const WORKING = [
      entry('11', 'AAPL', 'NEW', '2026-09-30T10:00:00Z'),
      entry('12', 'MSFT', 'NEW', '2026-09-29T10:00:00Z'),
      entry('13', 'TSLA', 'FILLED', '2026-09-28T10:00:00Z'),
    ];
    const rowFor = (symbol: string) =>
      Array.from(root.querySelectorAll<HTMLElement>('[data-testid="order-row"]')).find((r) => r.textContent?.includes(symbol))!;
    const cancelButton = () => byTestId<HTMLButtonElement>('orders-cancel-selected');

    /** Lets the confirmation dialog open, then answers it. */
    async function answerDialog(confirmed: boolean): Promise<void> {
      const dialog = TestBed.inject(DialogService);
      await vi.waitFor(() => expect(dialog.isOpen()).toBe(true));
      if (confirmed) {
        dialog.proceed();
      } else {
        dialog.cancel();
      }
    }

    /** The cancel runs and then the store re-reads the account: answer both. */
    async function answerCancel(orderId: string, ok: boolean): Promise<void> {
      const req = await vi.waitFor(() => http.expectOne({ method: 'DELETE', url: `/api/v1/orders/${orderId}` }));
      if (ok) {
        req.flush({ orderId, status: 'CANCELLED', message: 'Order cancelled successfully' });
      } else {
        req.flush({ errorCode: 'ORD-409', message: 'Not cancellable' }, { status: 409, statusText: 'Conflict' });
      }
    }

    it('only offers selection on rows that are still working', async () => {
      await start(WORKING);

      expect(rowFor('AAPL').classList.contains('clickable-row')).toBe(true);
      expect(rowFor('AAPL').getAttribute('tabindex')).toBe('0');
      expect(rowFor('TSLA').classList.contains('clickable-row')).toBe(false);
      expect(rowFor('TSLA').hasAttribute('tabindex')).toBe(false);

      rowFor('TSLA').click();
      await render();
      expect(cancelButton()).toBeNull();
    });

    it('shows the delete button once a row is clicked and hides it when the row is clicked again', async () => {
      await start(WORKING);
      expect(cancelButton()).toBeNull();

      rowFor('AAPL').click();
      await render();
      expect(cancelButton()?.getAttribute('aria-label')).toBe('Cancel selected order');
      expect(rowFor('AAPL').classList.contains('is-selected')).toBe(true);
      expect(rowFor('AAPL').getAttribute('aria-selected')).toBe('true');
      expect(rowFor('AAPL').querySelector('.select-mark')).toBeTruthy();

      rowFor('AAPL').click();
      await render();
      expect(cancelButton()).toBeNull();
      expect(rowFor('AAPL').getAttribute('aria-selected')).toBe('false');
    });

    it('selects several rows at once and works from the keyboard', async () => {
      await start(WORKING);

      rowFor('AAPL').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      rowFor('MSFT').dispatchEvent(space);
      await render();

      expect(space.defaultPrevented).toBe(true);
      expect(cancelButton()?.getAttribute('aria-label')).toBe('Cancel 2 selected orders');
    });

    it('keeps the order and nothing is sent when the confirmation is declined', async () => {
      await start(WORKING);
      rowFor('AAPL').click();
      await render();

      cancelButton()!.click();
      await answerDialog(false);
      await render();

      http.expectNone({ method: 'DELETE', url: '/api/v1/orders/11' });
      expect(rowFor('AAPL').classList.contains('is-selected')).toBe(true);
    });

    it('asks first, then cancels every selected order and refreshes', async () => {
      await start(WORKING);
      const toasts = TestBed.inject(NotificationService);
      rowFor('AAPL').click();
      rowFor('MSFT').click();
      await render();

      cancelButton()!.click();
      expect(TestBed.inject(DialogService).options().title).toBe('Cancel 2 orders?');
      await answerDialog(true);
      await answerCancel('11', true);
      await answerCancel('12', true);

      await vi.waitFor(() => expect(toasts.notifications().map((n) => n.message)).toContain('2 orders cancelled'));
      await answerAccountReads([
        entry('11', 'AAPL', 'CANCELLED', '2026-09-30T10:00:00Z'),
        entry('12', 'MSFT', 'CANCELLED', '2026-09-29T10:00:00Z'),
        WORKING[2],
      ]);
      expect(cancelButton()).toBeNull();
      expect(rowFor('AAPL').textContent).toContain('Cancelled');
    });

    it('says so when one order could not be cancelled but still cancels the rest', async () => {
      await start(WORKING);
      const toasts = TestBed.inject(NotificationService);
      rowFor('AAPL').click();
      rowFor('MSFT').click();
      await render();

      cancelButton()!.click();
      await answerDialog(true);
      await answerCancel('11', true);
      await answerCancel('12', false);

      await vi.waitFor(() => {
        const messages = toasts.notifications().map((n) => n.message);
        expect(messages).toContain('Order cancelled');
        expect(messages.some((m) => m.startsWith('One order could not be cancelled.'))).toBe(true);
      });
      await answerAccountReads(WORKING);
    });

    it('uses singular wording for one order', async () => {
      await start(WORKING);
      rowFor('AAPL').click();
      await render();

      cancelButton()!.click();

      expect(TestBed.inject(DialogService).options().title).toBe('Cancel this order?');
      await answerDialog(false);
    });

    it('forgets a selection once the filters hide the row', async () => {
      await start(WORKING);
      rowFor('AAPL').click();
      await render();
      expect(cancelButton()).toBeTruthy();

      await tick('filter-side', 'SELL');
      expect(cancelButton()).toBeNull();
      await tick('filter-side', 'BUY');
      expect(cancelButton()).toBeTruthy();
    });

    it('drops a selection when the order is no longer working after a refresh', async () => {
      await start(WORKING);
      rowFor('AAPL').click();
      await render();

      byTestId<HTMLButtonElement>('orders-refresh')!.click();
      await answerAccountReads([entry('11', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z'), WORKING[1], WORKING[2]]);

      expect(cancelButton()).toBeNull();
    });
  });
});
