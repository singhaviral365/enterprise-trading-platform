import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { SessionService } from './session.service';
import { WatchlistError, WatchlistService } from './watchlist.service';

const BASE = '/api/v1/accounts/1004/watchlists';
const LIST = {
  watchlistId: 9,
  accountId: 1004,
  name: 'Tech',
  createdAt: '2026-10-04T06:00:00Z',
  updatedAt: '2026-10-04T06:00:00Z',
  items: [],
};

describe('WatchlistService', () => {
  let service: WatchlistService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'jwt-token',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    service = TestBed.inject(WatchlistService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists watchlists and sends the access token', async () => {
    const result = service.list(1004);
    const request = http.expectOne(BASE);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    request.flush([LIST]);
    await expect(result).resolves.toEqual([LIST]);
  });

  it('creates a watchlist', async () => {
    const result = service.create(1004, 'Tech');
    const request = http.expectOne(BASE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Tech' });
    request.flush(LIST);
    await expect(result).resolves.toEqual(LIST);
  });

  it('renames a watchlist', async () => {
    const result = service.rename(1004, 9, 'Big tech');
    const request = http.expectOne(`${BASE}/9`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Big tech' });
    request.flush({ ...LIST, name: 'Big tech' });
    await expect(result).resolves.toMatchObject({ name: 'Big tech' });
  });

  it('deletes a watchlist', async () => {
    const result = service.remove(1004, 9);
    const request = http.expectOne(`${BASE}/9`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await expect(result).resolves.toBeUndefined();
  });

  it('adds a stock', async () => {
    const result = service.addItem(1004, 9, 'AAPL');
    const request = http.expectOne(`${BASE}/9/items`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ tickerSymbol: 'AAPL' });
    request.flush(LIST);
    await expect(result).resolves.toEqual(LIST);
  });

  it('removes a stock', async () => {
    const result = service.removeItem(1004, 9, 'AAPL');
    const request = http.expectOne(`${BASE}/9/items/AAPL`);
    expect(request.request.method).toBe('DELETE');
    request.flush(LIST);
    await expect(result).resolves.toEqual(LIST);
  });

  describe('error mapping', () => {
    async function failWith(status: number, body: object): Promise<WatchlistError> {
      const result = service.list(1004);
      const request = http.expectOne(BASE);
      if (status === 0) {
        request.error(new ProgressEvent('error'));
      } else {
        request.flush(body, { status, statusText: 'err' });
      }
      const error = await result.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(WatchlistError);
      return error as WatchlistError;
    }

    it.each([
      ['WTL-409', 409, 'already have a watchlist with that name'],
      ['WLI-409', 409, 'already on this watchlist'],
      ['INS-404', 404, 'not available for trading'],
      ['WTL-422', 422, 'at most 10 watchlists'],
      ['WLI-422', 422, 'at most 50 stocks'],
      ['WTL-404', 404, 'no longer exists'],
      ['AUTH-401', 401, 'session has expired'],
      ['ACC-403', 403, 'does not belong to your login'],
    ])('maps %s to a sentence and keeps the code', async (code, status, text) => {
      const error = await failWith(status, { errorCode: code, message: 'dev text' });
      expect(error.message).toContain(text);
      expect(error.message).not.toContain('dev text');
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
    });

    it('reports an unreachable service', async () => {
      const error = await failWith(0, new ProgressEvent('error'));
      expect(error.message).toContain('Cannot reach the trading service');
    });

    it('falls back for an unknown server error', async () => {
      const error = await failWith(500, { errorCode: 'SRV-500', message: 'boom' });
      expect(error.message).toContain('having trouble');
    });
  });
});
