import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OrderError, OrderService, PlaceOrderRequest, newIdempotencyKey } from './order.service';

const MARKET_BUY: PlaceOrderRequest = {
  accountId: 1001,
  symbol: 'AAPL',
  side: 'BUY',
  orderPricingType: 'MARKET',
  quantity: 5,
  idempotencyKey: 'ord-test-key-1',
};

describe('OrderService', () => {
  let orders: OrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    orders = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the order to the Trade API and returns the placed order', async () => {
    const placed = orders.placeOrder(MARKET_BUY);
    const request = http.expectOne({ method: 'POST', url: '/api/v1/orders' });
    expect(request.request.body).toEqual(MARKET_BUY);
    request.flush({
      orderId: '42',
      status: 'NEW',
      message: 'Order placed successfully',
      symbol: 'AAPL',
      side: 'BUY',
      orderPricingType: 'MARKET',
      quantity: 5,
      price: null,
    });

    await expect(placed).resolves.toMatchObject({ orderId: '42', status: 'NEW' });
  });

  it.each([
    [400, 'ORD-400', 'Insufficient funds', "You don't have enough cash for this order."],
    [403, 'ACC-403', 'Account not active', "Your account isn't active, so orders can't be placed."],
    [404, 'INS-404', 'Instrument not found', "This instrument isn't available to trade right now."],
    [409, 'ORD-409', 'Insufficient holdings', "You don't hold enough of this instrument to sell that many."],
    [409, 'ORD-409', 'Duplicate order', 'This order was already placed.'],
    [503, '', '', 'Cannot reach the trading service. Your order was not placed.'],
  ])('maps HTTP %i %s to a readable message', async (status, errorCode, message, expected) => {
    const placed = orders.placeOrder(MARKET_BUY);
    http.expectOne('/api/v1/orders').flush({ errorCode, message }, { status, statusText: 'Error' });

    await expect(placed).rejects.toBeInstanceOf(OrderError);
    await expect(placed).rejects.toThrow(expected);
  });

  it('creates a different idempotency key each time, within the API length limits', () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.length).toBeLessThanOrEqual(100);
  });
});
