import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TRADE_API_BASE_URL, provideApiClients } from './api.config';
import { WatchlistApi } from './watchlist-api.service';

const BASE = `${TRADE_API_BASE_URL}/api/v1/accounts/7/watchlists`;

/** The wrapper is the app's only door to the generated Watchlist client, so these pin it to the contract. */
describe('WatchlistApi', () => {
  let api: WatchlistApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(WatchlistApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the watchlists of an account', () => {
    api.list(7).subscribe();

    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates and renames with a name body', () => {
    api.create(7, 'Tech').subscribe();
    const create = http.expectOne(BASE);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Tech' });
    create.flush({});

    api.rename(7, 9, 'Big tech').subscribe();
    const rename = http.expectOne(`${BASE}/9`);
    expect(rename.request.method).toBe('PATCH');
    expect(rename.request.body).toEqual({ name: 'Big tech' });
    rename.flush({});
  });

  it('deletes a watchlist', () => {
    api.remove(7, 9).subscribe();

    const req = http.expectOne(`${BASE}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('adds a stock with a ticker body and removes it by ticker in the path', () => {
    api.addItem(7, 9, 'AAPL').subscribe();
    const add = http.expectOne(`${BASE}/9/items`);
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ tickerSymbol: 'AAPL' });
    add.flush({});

    api.removeItem(7, 9, 'BRK.B').subscribe();
    const remove = http.expectOne(`${BASE}/9/items/BRK.B`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush({});
  });
});
