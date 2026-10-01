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

  it('posts credentials to /auth/login and returns the tokens', () => {
    let result: unknown;
    api.login({ username: 'alice', password: 'pw' }).subscribe((r) => (result = r));

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'alice', password: 'pw' });
    req.flush({ accessToken: 'a' });
    expect(result).toEqual({ accessToken: 'a' });
  });

  it('posts a registration to /auth/register', () => {
    api.register({ username: 'alice', password: 'pw', email: 'a@b.co' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ username: 'alice', email: 'a@b.co' });
    req.flush({});
  });

  it('posts the refresh token to /auth/refresh', () => {
    api.refresh({ refreshToken: 'r' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'r' });
    req.flush({});
  });

  it('reads the signed-in profile from /auth/me', () => {
    api.currentUser().subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
