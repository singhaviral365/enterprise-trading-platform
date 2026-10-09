import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TRADE_API_BASE_URL, provideApiClients } from './api.config';
import { ChatTurnRoleEnum } from './generated/signals';
import { SignalsApi } from './signals-api.service';

const BASE = `${TRADE_API_BASE_URL}/api/v1`;

/** The wrapper is the app's only door to the generated Signals client, so these pin it to the contract. */
describe('SignalsApi', () => {
  let api: SignalsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(SignalsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for the numbers only, or for the narrative too', () => {
    api.signal(1001, 'AAPL', false).subscribe();
    const numeric = http.expectOne(`${BASE}/accounts/1001/signals/AAPL?format=numeric`);
    expect(numeric.request.method).toBe('GET');
    numeric.flush({});

    api.signal(1001, 'AAPL', true).subscribe();
    http.expectOne(`${BASE}/accounts/1001/signals/AAPL?format=narrative`).flush({});
  });

  it('puts a symbol with punctuation in the path safely', () => {
    api.signal(1001, 'BRK.B', false).subscribe();

    http.expectOne(`${BASE}/accounts/1001/signals/BRK.B?format=numeric`).flush({});
  });

  it('sends a question with the conversation so far', () => {
    const request = {
      accountId: 1001,
      symbol: 'AAPL',
      message: 'And the RSI?',
      conversationHistory: [
        { role: ChatTurnRoleEnum.User, content: 'Why?' },
        { role: ChatTurnRoleEnum.Assistant, content: 'Because.' },
      ],
    };

    api.chat(request).subscribe();

    const req = http.expectOne(`${BASE}/signals/chat`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({});
  });
});
