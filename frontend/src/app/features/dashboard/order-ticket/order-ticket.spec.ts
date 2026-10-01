import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import type { MarketRow } from '../market-board/market-board';
import { OrderTicket } from './order-ticket';

const ROW: MarketRow = {
  quote: { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'EQUITY', price: 200, details: { currency: 'USD' } },
  change: 1,
  changePercent: 0.5,
  previousClose: 199,
  currency: 'USD',
};

describe('OrderTicket', () => {
  let fixture: ComponentFixture<OrderTicket>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function choose(testId: string): Promise<void> {
    const radio = byTestId<HTMLInputElement>(testId)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  /** The ticket reads the linked account (id, status, cash, holdings) from the shared store. */
  async function answerAccountRequests(status = 'ACTIVE'): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({
      linked: true,
      message: 'Linked account found',
      accountNumber: 'ACC000001001',
    });
    const base = '/api/v1/accounts/1001';
    (await vi.waitFor(() => http.expectOne(base))).flush({
      id: 1001,
      accountId: 'ACC000001001',
      holderName: 'USER-1000',
      cashBalance: 25000,
      status,
      version: 1,
      lastUpdated: '2026-10-01T00:00:00Z',
    });
    http.expectOne(`${base}/balance`).flush({ accountId: 1001, cashBalance: 25000, currency: 'USD', asOf: '' });
    http.expectOne(`${base}/positions`).flush([{ accountId: 1001, symbol: 'AAPL', quantity: 50, averageCost: 175 }]);
    http.expectOne(`${base}/orders`).flush([]);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrderTicket],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    fixture = TestBed.createComponent(OrderTicket);
    fixture.componentRef.setInput('row', ROW);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await answerAccountRequests();
  });

  it('places a MARKET order without a price and shows the confirmation', async () => {
    await type('order-quantity', '3');
    expect(byTestId('order-estimate')?.textContent).toContain('$600.00');

    byTestId<HTMLButtonElement>('order-submit')!.click();
    const request = await vi.waitFor(() => http.expectOne({ method: 'POST', url: '/api/v1/orders' }));
    expect(request.request.body).toMatchObject({
      accountId: 1001,
      symbol: 'AAPL',
      side: 'BUY',
      orderPricingType: 'MARKET',
      quantity: 3,
    });
    expect(request.request.body).not.toHaveProperty('price');
    expect(request.request.body.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    request.flush({
      orderId: '77',
      status: 'NEW',
      message: 'Order placed successfully',
      symbol: 'AAPL',
      side: 'BUY',
      orderPricingType: 'MARKET',
      quantity: 3,
      price: null,
    });

    // A successful order reloads the account in the background, so render directly instead of
    // waiting for stability (that reload request stays unanswered here).
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('order-confirmation')?.textContent).toContain('Buy order placed');
    });
    expect(byTestId('order-id')?.textContent).toContain('#77');
  });

  it('sends the limit price for a LIMIT sell order', async () => {
    await choose('order-side-sell');
    await choose('order-type-limit');
    // The limit starts at the live price; the user adjusts it.
    expect(byTestId<HTMLInputElement>('order-limit-price')!.value).toBe('200.00');
    await type('order-limit-price', '210.5');
    await type('order-quantity', '10');

    byTestId<HTMLButtonElement>('order-submit')!.click();
    const request = await vi.waitFor(() => http.expectOne('/api/v1/orders'));
    expect(request.request.body).toMatchObject({ side: 'SELL', orderPricingType: 'LIMIT', quantity: 10, price: 210.5 });
    request.flush({
      orderId: '78',
      status: 'NEW',
      message: '',
      symbol: 'AAPL',
      side: 'SELL',
      orderPricingType: 'LIMIT',
      quantity: 10,
      price: 210.5,
    });
    // A successful order reloads the account in the background, so render directly instead of
    // waiting for stability (that reload request stays unanswered here).
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('order-confirmation')?.textContent).toContain('Sell order placed');
    });
  });

  it('blocks an empty limit price and a bad quantity', async () => {
    await choose('order-type-limit');
    await type('order-limit-price', '');
    await type('order-quantity', '0');

    byTestId<HTMLButtonElement>('order-submit')!.click();
    await fixture.whenStable();

    http.expectNone('/api/v1/orders');
    expect(root.textContent).toContain('Enter a limit price.');
    expect(root.textContent).toContain('Quantity must be a whole number of at least 1.');
  });

  it('warns when a buy costs more than the available cash', async () => {
    await type('order-quantity', '200');
    expect(byTestId('order-warning')?.textContent).toContain('more than your available cash');
  });

  it('shows a readable error when the Trade API rejects the order', async () => {
    byTestId<HTMLButtonElement>('order-submit')!.click();
    (await vi.waitFor(() => http.expectOne('/api/v1/orders'))).flush(
      { errorCode: 'ORD-400', message: 'Insufficient funds' },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(byTestId('order-error')?.textContent).toContain('You do not have enough cash for this order.');
    });
  });
});
