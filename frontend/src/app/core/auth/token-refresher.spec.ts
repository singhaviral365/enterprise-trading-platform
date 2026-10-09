import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_API_BASE_URL, provideApiClients } from '../../api/api.config';
import { NotificationService } from '../notification.service';
import { SESSION_STORAGE_KEY, SessionService } from '../session.service';
import { SESSION_ENDED_MESSAGE, TokenRefresher } from './token-refresher';

const REFRESH_URL = `${AUTH_API_BASE_URL}/auth/refresh`;
/** The tokens in these responses are never read: the real ones travel as HttpOnly cookies. */
const RENEWED = { accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 900 };

describe('TokenRefresher', () => {
  let refresher: TokenRefresher;
  let session: SessionService;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let signedInAt: number;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    });
    refresher = TestBed.inject(TokenRefresher);
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    session.start('alice', { expiresIn: 900 });
    signedInAt = session.session()!.expiresAt;
  });

  afterEach(() => {
    http.verify();
    Reflect.deleteProperty(navigator, 'locks');
  });

  const answerRefresh = async (body: object | null, status = 200) =>
    (await vi.waitFor(() => http.expectOne(REFRESH_URL))).flush(body, { status, statusText: 'x' });

  it('asks for a renewal with no body, because the refresh token is an HttpOnly cookie, and keeps the user signed in', async () => {
    const result = refresher.refresh(signedInAt);
    const request = await vi.waitFor(() => http.expectOne(REFRESH_URL));
    expect(request.request.body).toEqual({});
    request.flush(RENEWED);

    await expect(result).resolves.toBe(true);
    expect(session.username()).toBe('alice');
    expect(session.session()!.expiresAt).toBeGreaterThan(Date.now());
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('refresh');
  });

  it('shares one request between callers, because a refresh token may only be used once', async () => {
    const first = refresher.refresh(signedInAt);
    const second = refresher.refresh(signedInAt);

    await answerRefresh(RENEWED);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('can refresh again later, once the first has finished', async () => {
    const first = refresher.refresh(signedInAt);
    await answerRefresh(RENEWED);
    await first;

    const second = refresher.refresh(session.session()!.expiresAt);
    await answerRefresh(RENEWED);

    await expect(second).resolves.toBe(true);
  });

  it('skips the call when another request or tab already renewed the session', async () => {
    session.renew({ expiresIn: 1800 }, Date.now() + 5);

    await expect(refresher.refresh(signedInAt)).resolves.toBe(true);
    http.expectNone(REFRESH_URL);
  });

  it('picks up a renewal done in another tab through storage', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'alice', expiresAt: Date.now() + 600_000 }));

    await expect(refresher.refresh(signedInAt)).resolves.toBe(true);
    http.expectNone(REFRESH_URL);
  });

  it('ends the session and sends the user home when the refresh cookie is refused', async () => {
    const toasts = TestBed.inject(NotificationService);
    const result = refresher.refresh(signedInAt);

    await answerRefresh({ errorCode: 'AUTH-401', message: 'Unauthorised' }, 401);

    await expect(result).resolves.toBe(false);
    expect(session.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(toasts.notifications().map((n) => n.message)).toContain(SESSION_ENDED_MESSAGE);
  });

  it('keeps the session when the refresh fails for a reason that says nothing about the token', async () => {
    const result = refresher.refresh(signedInAt);

    await answerRefresh(null, 503);

    await expect(result).resolves.toBe(false);
    expect(session.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has nothing to refresh when signed out', async () => {
    session.clear();

    await expect(refresher.refresh(null)).resolves.toBe(false);
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

    const result = refresher.refresh(signedInAt);
    await answerRefresh(RENEWED);

    await expect(result).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith('auth.refresh', expect.any(Function));
  });
});
