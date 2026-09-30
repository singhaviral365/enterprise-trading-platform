import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';

import { provideApiClients, TRADE_API_BASE_URL } from './api.config';
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
});
