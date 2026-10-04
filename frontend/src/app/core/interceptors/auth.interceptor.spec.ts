import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_API_BASE_URL } from '../../api/api.config';
import { SessionService } from '../session.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionService).start('alice', { expiresIn: 900 });
  });

  afterEach(() => httpMock.verify());

  /** The session is two HttpOnly cookies the browser attaches itself, so the call opts in to credentials. */
  const carriesSession = (req: { request: { withCredentials: boolean; headers: { get(n: string): string | null; has(n: string): boolean } } }) => {
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(req.request.headers.has('Authorization')).toBe(false);
  };

  it('sends a same-origin Trade API request with credentials and the CSRF header, but no token', () => {
    http.get('/api/v1/orders').subscribe();

    carriesSession(httpMock.expectOne('/api/v1/orders'));
  });

  it('does the same for the market endpoint under the same prefix', () => {
    http.get('/api/v1/market/board').subscribe();

    carriesSession(httpMock.expectOne('/api/v1/market/board'));
  });

  it('does the same for the Auth service profile route', () => {
    http.get(`${AUTH_API_BASE_URL}/auth/me`).subscribe();

    carriesSession(httpMock.expectOne(`${AUTH_API_BASE_URL}/auth/me`));
  });

  it('sends the login, refresh and logout calls with credentials, so the cross-origin cookies are stored and sent', () => {
    for (const path of ['login', 'refresh', 'logout']) {
      http.post(`${AUTH_API_BASE_URL}/auth/${path}`, {}).subscribe();
      carriesSession(httpMock.expectOne(`${AUTH_API_BASE_URL}/auth/${path}`));
    }
  });

  it('does not make register a credentialed call: it needs no session', () => {
    http.post(`${AUTH_API_BASE_URL}/auth/register`, {}).subscribe();

    const req = httpMock.expectOne(`${AUTH_API_BASE_URL}/auth/register`);
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-Requested-With')).toBe(false);
  });

  it('never sends the session to a third party', () => {
    http.get('https://analytics.example.com/collect').subscribe();

    const req = httpMock.expectOne('https://analytics.example.com/collect');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-Requested-With')).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
  });

  it('leaves a request alone when nobody is signed in', () => {
    TestBed.inject(SessionService).clear();

    http.get('/api/v1/orders').subscribe();

    const req = httpMock.expectOne('/api/v1/orders');
    expect(req.request.withCredentials).toBe(false);
  });
});
