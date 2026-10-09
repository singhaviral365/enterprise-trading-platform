import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TRADE_API_BASE_URL, provideApiClients } from './api.config';
import { OrderSide, TriggerDirection } from './generated/strategies';
import { StrategiesApi } from './strategies-api.service';

const BASE = `${TRADE_API_BASE_URL}/api/v1`;

/** The wrapper is the app's only door to the generated Strategies client, so these pin it to the contract. */
describe('StrategiesApi', () => {
  let api: StrategiesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(StrategiesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the strategies of an account', () => {
    api.list(1001).subscribe();

    const req = http.expectOne(`${BASE}/accounts/1001/strategies`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a strategy with the whole request, limits included', () => {
    const request = {
      accountId: 1001,
      symbol: 'AAPL',
      side: OrderSide.Buy,
      quantity: 50,
      direction: TriggerDirection.Below,
      triggerPrice: 150,
      maxOrderValue: 10000,
      maxPositionQty: 200,
    };

    api.create(request).subscribe();

    const req = http.expectOne(`${BASE}/strategies`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({});
  });

  it('switches a strategy off and back on with PATCH and an enabled flag', () => {
    api.setEnabled(5001, false).subscribe();
    const off = http.expectOne(`${BASE}/strategies/5001`);
    expect(off.request.method).toBe('PATCH');
    expect(off.request.body).toEqual({ enabled: false });
    off.flush({});

    api.setEnabled(5001, true).subscribe();
    const on = http.expectOne(`${BASE}/strategies/5001`);
    expect(on.request.body).toEqual({ enabled: true });
    on.flush({});
  });

  it('cancels with DELETE', () => {
    api.cancel(5001).subscribe();

    const req = http.expectOne(`${BASE}/strategies/5001`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('reads a strategys trail from its runs route', () => {
    api.runs(5001).subscribe();

    const req = http.expectOne(`${BASE}/strategies/5001/runs`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
