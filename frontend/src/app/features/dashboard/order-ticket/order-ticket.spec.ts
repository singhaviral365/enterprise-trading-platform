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
    input.dispatchEvent(new Event('blur'));
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
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);
    http.expectNone('/api/v1/orders');
    expect(root.textContent).toContain('Enter a limit price.');
    expect(root.textContent).toContain('Quantity must be a whole number of at least 1.');
  });

  it('warns when a buy costs more than the available cash', async () => {
    await type('order-quantity', '200');
    expect(byTestId('order-warning')?.textContent).toContain('more than your available cash');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);
    http.expectNone({ method: 'POST', url: '/api/v1/orders' });
  });

  it('allows a buy that exactly uses the available cash and disables it one share over', async () => {
    await type('order-quantity', '125');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(false);

    await type('order-quantity', '126');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);
  });

  it('disables a limit buy priced so the total exceeds the cash, and enables it when the price drops', async () => {
    await choose('order-type-limit');
    await type('order-quantity', '100');
    await type('order-limit-price', '300');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);

    await type('order-limit-price', '250');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(false);
  });

  it('disables a market order when the instrument has no live price', async () => {
    fixture.componentRef.setInput('row', { ...ROW, quote: { ...ROW.quote, price: null } });
    await fixture.whenStable();

    expect(byTestId('order-warning')?.textContent).toContain('no live price');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);
  });

  it('never submits from a disabled state, even if the form is submitted directly', async () => {
    await type('order-quantity', '200');

    byTestId('order-ticket')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    http.expectNone({ method: 'POST', url: '/api/v1/orders' });
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
  it('disables Place order when selling more than is held, and enables it at the holding', async () => {
    await choose('order-side-sell');
    await type('order-quantity', '60');

    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);
    expect(byTestId('order-warning')?.textContent).toContain("can't sell more than that");

    await type('order-quantity', '50');
    expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(false);
    expect(byTestId('order-warning')).toBeNull();
  });

  it('moves the confirmation from Working to Filled when the account is re-read', async () => {
    byTestId<HTMLButtonElement>('order-submit')!.click();
    (await vi.waitFor(() => http.expectOne({ method: 'POST', url: '/api/v1/orders' }))).flush({
      orderId: '77',
      status: 'NEW',
      message: 'Order placed successfully',
      symbol: 'AAPL',
      side: 'BUY',
      orderPricingType: 'MARKET',
      quantity: 1,
      price: null,
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('order-status')?.textContent).toContain('Working');
    });

    // Placing the order re-reads the account straight away; the executor has filled it by then.
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
      cashBalance: 24800,
      status: 'ACTIVE',
      version: 2,
      lastUpdated: '2026-10-01T00:00:00Z',
    });
    http.expectOne(`${base}/balance`).flush({ accountId: 1001, cashBalance: 24800, currency: 'USD', asOf: '' });
    http.expectOne(`${base}/positions`).flush([]);
    http.expectOne(`${base}/orders`).flush([
      {
        orderId: '77',
        accountId: 1001,
        symbol: 'AAPL',
        side: 'BUY',
        orderPricingType: 'MARKET',
        quantity: 1,
        price: null,
        executedPrice: 200,
        status: 'FILLED',
        createdOn: '2026-10-01T00:00:00Z',
      },
    ]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('order-status')?.textContent).toContain('Filled');
    });
    expect(byTestId('order-explanation')?.textContent).toContain('has been filled');
  });
  describe('quantity stepper', () => {
    const quantity = () => byTestId<HTMLInputElement>('order-quantity')!.value;
    const press = async (id: string) => {
      byTestId<HTMLButtonElement>(id)!.click();
      await fixture.whenStable();
    };

    it('starts at 1 with minus disabled', () => {
      expect(quantity()).toBe('1');
      expect(byTestId<HTMLButtonElement>('order-quantity-decrease')!.disabled).toBe(true);
      expect(byTestId<HTMLButtonElement>('order-quantity-increase')!.disabled).toBe(false);
    });

    it('steps up and down but never below 1', async () => {
      await press('order-quantity-increase');
      await press('order-quantity-increase');
      expect(quantity()).toBe('3');
      expect(byTestId('order-estimate')?.textContent).toContain('$600.00');

      await press('order-quantity-decrease');
      await press('order-quantity-decrease');
      expect(quantity()).toBe('1');
      expect(byTestId<HTMLButtonElement>('order-quantity-decrease')!.disabled).toBe(true);
    });

    it('turns an empty or invalid entry into a valid one', async () => {
      await type('order-quantity', '');
      await press('order-quantity-increase');
      expect(quantity()).toBe('1');

      await type('order-quantity', 'abc');
      await press('order-quantity-increase');
      expect(quantity()).toBe('1');
    });

    it('stops at the maximum quantity', async () => {
      await type('order-quantity', '1000000');

      expect(byTestId<HTMLButtonElement>('order-quantity-increase')!.disabled).toBe(true);
      await type('order-quantity', '999999');
      await press('order-quantity-increase');
      expect(quantity()).toBe('1000000');
    });

    it('steps with the arrow keys without moving the caret', async () => {
      const input = byTestId<HTMLInputElement>('order-quantity')!;
      const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      input.dispatchEvent(up);
      await fixture.whenStable();
      expect(up.defaultPrevented).toBe(true);
      expect(quantity()).toBe('2');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await fixture.whenStable();
      expect(quantity()).toBe('1');
    });

    it('re-enables a valid order after fixing a bad quantity with the stepper', async () => {
      await type('order-quantity', '0');
      expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(true);

      await press('order-quantity-increase');

      expect(byTestId<HTMLButtonElement>('order-submit')!.disabled).toBe(false);
    });
  });
});
