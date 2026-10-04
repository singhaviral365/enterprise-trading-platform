import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_API_BASE_URL, provideApiClients } from '../api/api.config';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => http.verify());

  it('starts a session on login, without keeping the tokens the response carries', async () => {
    const done = auth.login('alice.trader', 'secret-password');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/login` });
    expect(request.request.body).toEqual({ username: 'alice.trader', password: 'secret-password' });
    request.flush({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    await done;

    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    expect(session.session()!.expiresAt).toBeGreaterThan(Date.now() + 800_000);
    expect(JSON.stringify(session.session())).not.toContain('"a"');
  });

  it('rejects with the HTTP error and starts no session when login fails', async () => {
    const done = auth.login('alice.trader', 'x');
    http
      .expectOne(`${AUTH_API_BASE_URL}/auth/login`)
      .flush({ errorCode: 'AUTH-401', message: 'raw' }, { status: 401, statusText: 'Unauthorized' });

    await expect(done).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(session.isLoggedIn()).toBe(false);
  });

  it('sends the username, password and email on register', async () => {
    const done = auth.register({ username: 'alice.trader', password: 'long enough password', email: 'alice@example.com' });
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/register` });
    expect(request.request.body).toEqual({
      username: 'alice.trader',
      password: 'long enough password',
      email: 'alice@example.com',
    });
    request.flush({ id: 1, username: 'alice.trader', email: 'alice@example.com', roles: ['CUSTOMER'] });

    await expect(done).resolves.toMatchObject({ id: 1, email: 'alice@example.com' });
  });

  it('reads the profile from /auth/me', async () => {
    const done = auth.me();
    http
      .expectOne({ method: 'GET', url: `${AUTH_API_BASE_URL}/auth/me` })
      .flush({ id: 1, username: 'alice.trader', email: 'alice@example.com', roles: ['CUSTOMER'] });
    await expect(done).resolves.toMatchObject({ username: 'alice.trader' });
  });

  it('signs out at once and asks the Auth service to revoke the refresh token and clear the cookies', () => {
    session.start('alice.trader', { expiresIn: 900 });

    auth.logout();

    expect(session.isLoggedIn()).toBe(false);
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/logout` });
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('stays signed out even when the logout call fails', () => {
    session.start('alice.trader', { expiresIn: 900 });

    auth.logout();
    http.expectOne(`${AUTH_API_BASE_URL}/auth/logout`).flush(null, { status: 500, statusText: 'x' });

    expect(session.isLoggedIn()).toBe(false);
  });
});
