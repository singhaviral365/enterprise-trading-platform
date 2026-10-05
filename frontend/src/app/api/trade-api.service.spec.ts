import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';

import { provideApiClients, TRADE_API_BASE_URL } from './api.config';
import { OrderPricingType, OrderSide, OrderStatus } from './generated/trade';
import { TradeApi } from './trade-api.service';

describe('TradeApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    return { api: TestBed.inject(TradeApi), http: TestBed.inject(HttpTestingController) };
  }

  it('calls the contract path for account balance and returns the body', () => {
    const { api, http } = setup();
    let result: unknown;
    api.balance(7).subscribe((b) => (result = b));

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/7/balance`);
    expect(req.request.method).toBe('GET');
    req.flush({ cashBalance: 10 });
    expect(result).toEqual({ cashBalance: 10 });
    http.verify();
  });

  it('places an order with POST /api/v1/orders', () => {
    const { api, http } = setup();
    const order = {
      accountId: 7,
      symbol: 'AAPL',
      side: OrderSide.Buy,
      orderPricingType: OrderPricingType.Market,
      quantity: 1,
      idempotencyKey: 'k',
    };
    api.placeOrder(order).subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(order);
    req.flush({});
    http.verify();
  });

  it('cancels an order by id', () => {
    const { api, http } = setup();
    api.cancelOrder('5f0c8c7e-1111-4222-8333-944455556666').subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders/5f0c8c7e-1111-4222-8333-944455556666`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    http.verify();
  });

  it('reads the account, its positions and its orders', () => {
    const { api, http } = setup();
    api.account(7).subscribe();
    api.positions(7).subscribe();
    api.orderHistory(7).subscribe();

    http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/7`).flush({});
    http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/7/positions`).flush([]);
    http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/7/orders`).flush([]);
    http.verify();
  });

  it('filters order history by status and date range', () => {
    const { api, http } = setup();
    api.orderHistory(7, { status: OrderStatus.Filled, from: '2026-09-01', to: '2026-09-30' }).subscribe();

    const req = http.expectOne((r) => r.url === `${TRADE_API_BASE_URL}/api/v1/accounts/7/orders`);
    expect(req.request.params.get('status')).toBe('FILLED');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('to')).toBe('2026-09-30');
    req.flush([]);
    http.verify();
  });

  it('opens an account with POST /api/v1/accounts/create and looks up the link with GET', () => {
    const { api, http } = setup();
    api.createAccount({ client_name: 'Priya', phone_no: '5551234567', email: 'p@x.co' }).subscribe();
    api.accountLink().subscribe();

    const create = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/create`);
    expect(create.request.method).toBe('POST');
    create.flush({});
    expect(http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/link`).request.method).toBe('GET');
    http.verify();
  });
});
