import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_API_BASE_URL, provideApiClients } from '../../api/api.config';
import { NotificationService } from '../notification.service';
import { SESSION_STORAGE_KEY, SessionService } from '../session.service';
import { SESSION_ENDED_MESSAGE, TokenRefresher } from './token-refresher';

const REFRESH_URL = `${AUTH_API_BASE_URL}/auth/refresh`;
const OLD = { accessToken: 'old-access', refreshToken: 'old-refresh', tokenType: 'Bearer', expiresIn: 900 };
const NEW = { accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 900 };

describe('TokenRefresher', () => {
  let refresher: TokenRefresher;
  let session: SessionService;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    });
    refresher = TestBed.inject(TokenRefresher);
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    session.start('alice', OLD);
  });

  afterEach(() => {
    http.verify();
    Reflect.deleteProperty(navigator, 'locks');
  });

  const answerRefresh = async (body: object | null, status = 200) =>
    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(body, { status, statusText: 'x' });

  it('trades the refresh token for a new pair and keeps the user signed in', async () => {
    const result = refresher.refresh('old-access');
    const request = await vi.waitFor(() => http.expectOne(REFRESH_URL));
    expect(request.request.body).toEqual({ refreshToken: 'old-refresh' });
    request.flush(NEW);

    await expect(result).resolves.toBe('new-access');
    expect(session.accessToken()).toBe('new-access');
    expect(session.username()).toBe('alice');
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({ refreshToken: 'new-refresh' });
  });

  it('shares one request between callers, because a refresh token may only be used once', async () => {
    const first = refresher.refresh('old-access');
    const second = refresher.refresh('old-access');

    await answerRefresh(NEW);

    await expect(Promise.all([first, second])).resolves.toEqual(['new-access', 'new-access']);
  });

  it('can refresh again later, once the first has finished', async () => {
    const first = refresher.refresh('old-access');
    await answerRefresh(NEW);
    await first;

    const second = refresher.refresh('new-access');
    await answerRefresh({ ...NEW, accessToken: 'newer-access', refreshToken: 'newer-refresh' });

    await expect(second).resolves.toBe('newer-access');
  });

  it('adopts tokens another request or tab already refreshed, without a second call', async () => {
    session.renew(NEW);

    await expect(refresher.refresh('old-access')).resolves.toBe('new-access');
    http.expectNone(REFRESH_URL);
  });

  it('picks up a refresh done in another tab through storage', async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'alice', accessToken: 'tab-b', refreshToken: 'tab-b-refresh', expiresAt: Date.now() + 60_000 }),
    );

    await expect(refresher.refresh('old-access')).resolves.toBe('tab-b');
    http.expectNone(REFRESH_URL);
  });

  it('ends the session and sends the user home when the refresh token is refused', async () => {
    const toasts = TestBed.inject(NotificationService);
    const result = refresher.refresh('old-access');

    await answerRefresh({ errorCode: 'AUTH-401', message: 'Unauthorised' }, 401);

    await expect(result).resolves.toBeNull();
    expect(session.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(toasts.notifications().map((n) => n.message)).toContain(SESSION_ENDED_MESSAGE);
  });

  it('keeps the session when the refresh fails for a reason that says nothing about the token', async () => {
    const result = refresher.refresh('old-access');

    await answerRefresh(null, 503);

    await expect(result).resolves.toBeNull();
    expect(session.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has nothing to refresh when signed out', async () => {
    session.clear();

    await expect(refresher.refresh(null)).resolves.toBeNull();
    http.expectNone(REFRESH_URL);
  });

  it('endSession is a no-op when nobody is signed in, so there is no stray toast', () => {
    session.clear();
    const toasts = TestBed.inject(NotificationService);

    refresher.endSession();

    expect(toasts.notifications()).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('serialises refreshes across tabs with a Web Lock when the browser has one', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });

    const result = refresher.refresh('old-access');
    await answerRefresh(NEW);

    await expect(result).resolves.toBe('new-access');
    expect(request).toHaveBeenCalledWith('auth.refresh', expect.any(Function));
  });
});
