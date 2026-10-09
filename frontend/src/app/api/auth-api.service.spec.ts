import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AUTH_API_BASE_URL, provideApiClients } from './api.config';
import { AuthApi } from './auth-api.service';

/** The wrapper is the app's only door to the generated Auth client, so these pin it to the contract paths. */
describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts credentials to /auth/login and returns the answer (a challenge, or the tokens)', () => {
    let result: unknown;
    api.login({ username: 'alice', password: 'pw' }).subscribe((r) => (result = r));

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'alice', password: 'pw' });
    req.flush({ twoFactorRequired: true, challenge: { challengeId: 'c-1' } });
    expect(result).toEqual({ twoFactorRequired: true, challenge: { challengeId: 'c-1' } });
  });

  it.each([
    ['verifyLogin', '/auth/login/verify', { challengeId: 'c-1', code: '123456' }],
    ['resendLoginCode', '/auth/login/resend', { challengeId: 'c-1' }],
    ['forgotPassword', '/auth/password/forgot', { username: 'alice', email: 'a@b.co' }],
    ['resendResetCode', '/auth/password/resend', { challengeId: 'c-1' }],
    ['verifyResetCode', '/auth/password/verify', { challengeId: 'c-1', code: '123456' }],
    ['resetPassword', '/auth/password/reset', { resetToken: 'token', newPassword: 'N3w!Password#1' }],
  ] as const)('%s posts its body to %s', (method, path, body) => {
    (api[method] as (request: typeof body) => { subscribe: () => void })(body).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}${path}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('posts a registration to /auth/register', () => {
    api.register({ username: 'alice', password: 'pw', email: 'a@b.co' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ username: 'alice', email: 'a@b.co' });
    req.flush({});
  });

  it('posts an empty body to /auth/refresh, so the service uses the HttpOnly refresh cookie', () => {
    api.refresh().subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('can still post a refresh token in the body, as a client without cookies would', () => {
    api.refresh({ refreshToken: 'r' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'r' });
    req.flush({});
  });

  it('posts to /auth/logout to revoke the refresh token and clear the cookies', () => {
    api.logout().subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('reads the signed-in profile from /auth/me', () => {
    api.currentUser().subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
