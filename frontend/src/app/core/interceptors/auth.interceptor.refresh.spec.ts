import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_API_BASE_URL, provideApiClients } from '../../api/api.config';
import { ACCESS_TOKEN_PROVIDER } from '../auth/access-token.provider';
import { SessionService } from '../session.service';
import { authInterceptor } from './auth.interceptor';

const REFRESH_URL = `${AUTH_API_BASE_URL}/auth/refresh`;
const ORDERS = '/api/v1/accounts/1001';
const OLD = { accessToken: 'old', refreshToken: 'old-refresh', tokenType: 'Bearer', expiresIn: 900 };
const NEW = { accessToken: 'new', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 900 };

/** The interceptor wired to the real session and refresher, as the app runs it. */
describe('authInterceptor session renewal', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let session: SessionService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        {
          provide: ACCESS_TOKEN_PROVIDER,
          useFactory: () => {
            const current = TestBed.inject(SessionService);
            return { getAccessToken: () => current.accessToken(), isAuthenticated: () => current.isLoggedIn() };
          },
        },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    session.start('alice', OLD);
  });

  afterEach(() => http.verify());

  const bearer = (request: { request: { headers: { get(n: string): string | null } } }) =>
    request.request.headers.get('Authorization');

  it('refreshes once on a 401 and retries the call with the new token', async () => {
    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));

    const first = http.expectOne(ORDERS);
    expect(bearer(first)).toBe('Bearer old');
    first.flush(null, { status: 401, statusText: 'Unauthorized' });

    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(NEW);
    const retry = await vi.waitFor(() => http.expectOne(ORDERS));
    expect(bearer(retry)).toBe('Bearer new');
    retry.flush({ ok: true });

    await expect(result).resolves.toEqual({ ok: true });
    expect(session.accessToken()).toBe('new');
  });

  it('shares one refresh between calls that fail together', async () => {
    const calls = [client.get(`${ORDERS}/balance`), client.get(`${ORDERS}/positions`)].map(
      (call) => new Promise((resolve, reject) => call.subscribe({ next: resolve, error: reject })),
    );
    for (const path of ['balance', 'positions']) {
      http.expectOne(`${ORDERS}/${path}`).flush(null, { status: 401, statusText: 'Unauthorized' });
    }

    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(NEW);
    for (const path of ['balance', 'positions']) {
      const retry = await vi.waitFor(() => http.expectOne(`${ORDERS}/${path}`));
      expect(bearer(retry)).toBe('Bearer new');
      retry.flush({ path });
    }

    await expect(Promise.all(calls)).resolves.toEqual([{ path: 'balance' }, { path: 'positions' }]);
  });

  it('ends the session and goes home when the refresh is refused, and fails the call', async () => {
    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));
    http.expectOne(ORDERS).flush(null, { status: 401, statusText: 'Unauthorized' });

    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(session.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('does not loop when the retry is rejected as well', async () => {
    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));
    http.expectOne(ORDERS).flush(null, { status: 401, statusText: 'Unauthorized' });
    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(NEW);

    (await vi.waitFor(() => http.expectOne(ORDERS))).flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
    http.expectNone(REFRESH_URL);
  });

  it('refreshes before sending when the stored token has already expired, e.g. after a reload', async () => {
    session.start('alice', { ...OLD, expiresIn: -60 });

    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));
    http.expectNone(ORDERS);
    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(NEW);

    const request = await vi.waitFor(() => http.expectOne(ORDERS));
    expect(bearer(request)).toBe('Bearer new');
    request.flush({ ok: true });
    await expect(result).resolves.toEqual({ ok: true });
  });

  it('fails the call and ends the session when an expired token cannot be refreshed', async () => {
    session.start('alice', { ...OLD, expiresIn: -60 });

    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));
    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    http.expectNone(ORDERS);
    expect(session.isLoggedIn()).toBe(false);
  });

  it('passes other errors through without refreshing', async () => {
    const result = new Promise((resolve, reject) => client.get(ORDERS).subscribe({ next: resolve, error: reject }));

    http.expectOne(ORDERS).flush(null, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toMatchObject({ status: 409 });
    http.expectNone(REFRESH_URL);
    expect(session.isLoggedIn()).toBe(true);
  });

  it('does not refresh for a 401 from a service that never got the token', async () => {
    const result = new Promise((resolve, reject) =>
      client.get('https://other.example.com/x').subscribe({ next: resolve, error: reject }),
    );

    http.expectOne('https://other.example.com/x').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    http.expectNone(REFRESH_URL);
  });
});
