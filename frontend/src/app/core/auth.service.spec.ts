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

  it('starts a session on login when two-step sign-in is off, without keeping the tokens', async () => {
    const done = auth.login('alice.trader', 'secret-password');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/login` });
    expect(request.request.body).toEqual({ username: 'alice.trader', password: 'secret-password' });
    request.flush({
      twoFactorRequired: false,
      tokens: { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 },
    });
    await expect(done).resolves.toEqual({ kind: 'signed-in' });

    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    expect(session.session()!.expiresAt).toBeGreaterThan(Date.now() + 800_000);
    expect(JSON.stringify(session.session())).not.toContain('"a"');
  });

  it('starts NO session when the password was right but a code is still to be entered', async () => {
    const challenge = { challengeId: 'c-1', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 };
    const done = auth.login('alice.trader', 'secret-password');
    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush({ twoFactorRequired: true, challenge });

    await expect(done).resolves.toEqual({ kind: 'code-required', challenge });
    expect(session.isLoggedIn()).toBe(false);
  });

  it('fails clearly when the sign-in answer holds neither a code to enter nor a session', async () => {
    const done = auth.login('alice.trader', 'x');
    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush({ twoFactorRequired: true });

    await expect(done).rejects.toThrow('neither a code');
    expect(session.isLoggedIn()).toBe(false);
  });

  it('starts the session once the emailed code is right, and not before', async () => {
    const done = auth.verifyLogin('alice.trader', 'c-1', '482913');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/login/verify` });
    expect(request.request.body).toEqual({ challengeId: 'c-1', code: '482913' });
    expect(session.isLoggedIn()).toBe(false);
    request.flush({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    await done;

    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
  });

  it('starts no session when the code is refused', async () => {
    const done = auth.verifyLogin('alice.trader', 'c-1', '000000');
    http
      .expectOne(`${AUTH_API_BASE_URL}/auth/login/verify`)
      .flush({ errorCode: 'OTP-401', message: 'raw' }, { status: 401, statusText: 'Unauthorized' });

    await expect(done).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(session.isLoggedIn()).toBe(false);
  });

  it('asks for another sign-in code for a challenge', async () => {
    const done = auth.resendLoginCode('c-1');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/login/resend` });
    expect(request.request.body).toEqual({ challengeId: 'c-1' });
    request.flush({ challengeId: 'c-1', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 });

    await expect(done).resolves.toMatchObject({ challengeId: 'c-1' });
  });

  describe('forgot password', () => {
    it('asks for a reset code with the username and email', async () => {
      const done = auth.requestPasswordReset('alice.trader', 'alice@example.com');
      const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/password/forgot` });
      expect(request.request.body).toEqual({ username: 'alice.trader', email: 'alice@example.com' });
      request.flush({ challengeId: 'c-9', expiresIn: 600, resendAfter: 30 }, { status: 202, statusText: 'Accepted' });

      await expect(done).resolves.toEqual({ challengeId: 'c-9', expiresIn: 600, resendAfter: 30 });
    });

    it('resends the code, trades a right one for a reset token, and sets the password with it', async () => {
      const resent = auth.resendResetCode('c-9');
      http
        .expectOne(`${AUTH_API_BASE_URL}/auth/password/resend`)
        .flush({ challengeId: 'c-9', expiresIn: 600, resendAfter: 30 }, { status: 202, statusText: 'Accepted' });
      await resent;

      const verified = auth.verifyResetCode('c-9', '482913');
      const verify = http.expectOne(`${AUTH_API_BASE_URL}/auth/password/verify`);
      expect(verify.request.body).toEqual({ challengeId: 'c-9', code: '482913' });
      verify.flush({ resetToken: 'reset-token', expiresIn: 600 });
      await expect(verified).resolves.toEqual({ resetToken: 'reset-token', expiresIn: 600 });

      const reset = auth.resetPassword('reset-token', 'N3w!Password#1');
      const request = http.expectOne(`${AUTH_API_BASE_URL}/auth/password/reset`);
      expect(request.request.body).toEqual({ resetToken: 'reset-token', newPassword: 'N3w!Password#1' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await expect(reset).resolves.toBeUndefined();
    });

    it('signs nobody in after a password reset', async () => {
      const done = auth.resetPassword('reset-token', 'N3w!Password#1');
      http.expectOne(`${AUTH_API_BASE_URL}/auth/password/reset`).flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(session.isLoggedIn()).toBe(false);
    });

    it('lets the HTTP error through, e.g. a password that is the same as the current one', async () => {
      const done = auth.resetPassword('reset-token', 'Same!Password1');
      http
        .expectOne(`${AUTH_API_BASE_URL}/auth/password/reset`)
        .flush({ errorCode: 'PWD-422', message: 'raw' }, { status: 422, statusText: 'Unprocessable' });

      await expect(done).rejects.toBeInstanceOf(HttpErrorResponse);
    });
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
    request.flush({
      verificationRequired: true,
      challenge: { challengeId: 'reg-1', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 },
    });

    await expect(done).resolves.toMatchObject({ kind: 'code-required', challenge: { challengeId: 'reg-1' } });
    expect(session.isLoggedIn()).toBe(false);
  });

  it('reports a login that already exists when the email check is switched off', async () => {
    const done = auth.register({ username: 'alice.trader', password: 'long enough password', email: 'alice@example.com' });
    http.expectOne(`${AUTH_API_BASE_URL}/auth/register`).flush({
      verificationRequired: false,
      user: { id: 1, username: 'alice.trader', email: 'alice@example.com', roles: ['CUSTOMER'], twoFactorEnabled: false },
    });

    await expect(done).resolves.toMatchObject({ kind: 'registered', user: { id: 1 } });
  });

  it('creates the login by sending the emailed code to /auth/register/verify, and signs nobody in', async () => {
    const done = auth.verifyRegistration('reg-1', '123456');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/register/verify` });
    expect(request.request.body).toEqual({ challengeId: 'reg-1', code: '123456' });
    request.flush({ id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], twoFactorEnabled: false });

    await expect(done).resolves.toMatchObject({ id: 1 });
    expect(session.isLoggedIn()).toBe(false);
  });

  it('asks for the registration code again with /auth/register/resend', async () => {
    const done = auth.resendRegistrationCode('reg-1');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/register/resend` });
    expect(request.request.body).toEqual({ challengeId: 'reg-1' });
    request.flush({ challengeId: 'reg-2', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 });

    await expect(done).resolves.toMatchObject({ challengeId: 'reg-2' });
  });

  it('switches two-step sign-in with PUT /auth/me/two-factor', async () => {
    const done = auth.setTwoFactor(true);
    const request = http.expectOne({ method: 'PUT', url: `${AUTH_API_BASE_URL}/auth/me/two-factor` });
    expect(request.request.body).toEqual({ enabled: true });
    request.flush({ id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], twoFactorEnabled: true });

    await expect(done).resolves.toMatchObject({ twoFactorEnabled: true });
  });

  it('changes the password with POST /auth/me/password and keeps the session going on the fresh tokens', async () => {
    session.start('alice.trader', { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 60 });
    const done = auth.changePassword('old password 1!', 'new password 2!');
    const request = http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/me/password` });
    expect(request.request.body).toEqual({ currentPassword: 'old password 1!', newPassword: 'new password 2!' });
    request.flush({ accessToken: 'a2', refreshToken: 'r2', tokenType: 'Bearer', expiresIn: 900 });

    await expect(done).resolves.toBeUndefined();
    expect(session.isLoggedIn()).toBe(true);
  });

  it('rejects a wrong current password and leaves the session alone', async () => {
    session.start('alice.trader', { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 60 });
    const done = auth.changePassword('wrong', 'new password 2!');
    http
      .expectOne(`${AUTH_API_BASE_URL}/auth/me/password`)
      .flush({ errorCode: 'PWD-403', message: 'x', attemptsLeft: 2 }, { status: 403, statusText: 'Forbidden' });

    await expect(done).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(session.isLoggedIn()).toBe(true);
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
