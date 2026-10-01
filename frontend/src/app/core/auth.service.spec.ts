import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthError, AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => http.verify());

  it('starts a session with the returned tokens on login', async () => {
    const done = auth.login('alice.trader', 'secret-password');
    http
      .expectOne({ method: 'POST', url: 'http://localhost:3000/auth/login' })
      .flush({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    await done;

    expect(session.isLoggedIn()).toBe(true);
    expect(session.accessToken()).toBe('a');
  });

  it.each([
    [401, 'Incorrect username or password.'],
    [422, 'Please check your username and password.'],
    [500, 'The sign-in service is having trouble right now. Please try again later.'],
  ])('maps a %i login failure to a readable message', async (status, message) => {
    const done = auth.login('alice.trader', 'x');
    http.expectOne('http://localhost:3000/auth/login').flush({ errorCode: 'E', message: 'raw' }, { status, statusText: 'Error' });

    await expect(done).rejects.toEqual(expect.objectContaining({ message, status }));
    await expect(done).rejects.toBeInstanceOf(AuthError);
    expect(session.isLoggedIn()).toBe(false);
  });

  it('reports an unreachable service in plain language', async () => {
    const done = auth.login('alice.trader', 'x');
    http.expectOne('http://localhost:3000/auth/login').error(new ProgressEvent('error'));

    await expect(done).rejects.toThrow('Cannot reach the sign-in service');
  });

  it('maps a duplicate username on register to a readable message', async () => {
    const done = auth.register('alice.trader', 'long enough password', 'alice@example.com');
    http
      .expectOne({ method: 'POST', url: 'http://localhost:3000/auth/register' })
      .flush({ errorCode: 'AUTH-409', message: 'Registration failed' }, { status: 409, statusText: 'Conflict' });

    await expect(done).rejects.toThrow('That username or email is already registered');
  });

  it('clears the session on logout', () => {
    session.start('alice.trader', { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    auth.logout();
    expect(session.isLoggedIn()).toBe(false);
  });
});
