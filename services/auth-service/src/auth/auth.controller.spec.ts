// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; the controller only needs the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginFlowService } from './login-flow.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationFlowService } from './registration-flow.service';
import { AccountSecurityService } from './account-security.service';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth-cookies';
import { PasswordIncorrectException, PasswordLockedException, UnauthorisedException } from '../common/exceptions';

const TOKENS = { accessToken: 'new.access.jwt', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 900 };
const CHALLENGE = { challengeId: '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11', email: 'a***@example.com', expiresIn: 300, resendAfter: 30 };

describe('AuthController session cookies', () => {
  let authService: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock };
  let loginFlow: { start: jest.Mock; verify: jest.Mock; resend: jest.Mock };
  let passwordReset: { request: jest.Mock; resend: jest.Mock; verifyCode: jest.Mock; resetPassword: jest.Mock };
  let registration: { start: jest.Mock; verify: jest.Mock; resend: jest.Mock };
  let accountSecurity: { setTwoFactor: jest.Mock; changePassword: jest.Mock };
  let controller: AuthController;

  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const request = (headers: Record<string, string> = {}) => ({ headers, ip: '10.0.0.1' }) as never;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue(TOKENS),
      refresh: jest.fn().mockResolvedValue(TOKENS),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    loginFlow = {
      start: jest.fn().mockResolvedValue({ twoFactorRequired: false, tokens: TOKENS }),
      verify: jest.fn().mockResolvedValue(TOKENS),
      resend: jest.fn().mockResolvedValue(CHALLENGE),
    };
    passwordReset = {
      request: jest.fn().mockResolvedValue({ challengeId: CHALLENGE.challengeId, expiresIn: 600, resendAfter: 30 }),
      resend: jest.fn().mockResolvedValue({ challengeId: CHALLENGE.challengeId, expiresIn: 600, resendAfter: 30 }),
      verifyCode: jest.fn().mockResolvedValue({ resetToken: 'reset-token', expiresIn: 600 }),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    registration = {
      start: jest.fn().mockResolvedValue({ verificationRequired: true, challenge: CHALLENGE }),
      verify: jest.fn().mockResolvedValue({ id: 7, username: 'alice.trader1' }),
      resend: jest.fn().mockResolvedValue(CHALLENGE),
    };
    accountSecurity = {
      setTwoFactor: jest.fn().mockResolvedValue({ id: 1000, twoFactorEnabled: true }),
      changePassword: jest.fn().mockResolvedValue(TOKENS),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      loginFlow as unknown as LoginFlowService,
      passwordReset as unknown as PasswordResetService,
      registration as unknown as RegistrationFlowService,
      accountSecurity as unknown as AccountSecurityService,
    );
  });

  describe('register and profile', () => {
    it('starts a registration with the username, password and email from the body, keyed by who is asking', async () => {
      const answer = await controller.register(
        { username: 'alice.trader1', password: 'Str0ng!Password#', email: 'a@b.co' },
        request(),
      );

      expect(registration.start).toHaveBeenCalledWith('alice.trader1', 'Str0ng!Password#', 'a@b.co', '10.0.0.1');
      expect(answer).toEqual({ verificationRequired: true, challenge: CHALLENGE });
    });

    it('falls back to the placeholder address when no email is given, as registration always did', async () => {
      await controller.register({ username: 'alice.trader1', password: 'Str0ng!Password#' }, request());

      expect(registration.start.mock.calls[0][2]).toBe('alice.trader1@local.auth');
    });

    it('creates the login only from a verified code', async () => {
      await expect(
        controller.verifyRegistration({ challengeId: CHALLENGE.challengeId, code: '123456' }, request()),
      ).resolves.toEqual({ id: 7, username: 'alice.trader1' });
      expect(registration.verify).toHaveBeenCalledWith(CHALLENGE.challengeId, '123456', '10.0.0.1');
    });

    it('sends the registration code again', async () => {
      await expect(controller.resendRegistrationCode({ challengeId: CHALLENGE.challengeId })).resolves.toEqual(CHALLENGE);
      expect(registration.resend).toHaveBeenCalledWith(CHALLENGE.challengeId);
    });

    it('returns the profile of the authenticated user', async () => {
      const getUser = jest.fn().mockResolvedValue({ id: 1000 });
      (authService as unknown as { getUser: jest.Mock }).getUser = getUser;

      await expect(
        controller.getCurrentUser({ userId: 1000, roles: ['CUSTOMER'], iat: 1, exp: 2 }),
      ).resolves.toEqual({ id: 1000 });
      expect(getUser).toHaveBeenCalledWith(1000);
    });

    it('refuses a profile request with no user on it', async () => {
      await expect(controller.getCurrentUser(undefined as never)).rejects.toBeInstanceOf(UnauthorisedException);
    });
  });

  describe('who is calling (login throttling key)', () => {
    const callerFor = async (request: object) => {
      await controller.login({ username: 'alice.trader1', password: 'pw' }, request as never, response() as never);
      return loginFlow.start.mock.calls[loginFlow.start.mock.calls.length - 1][2];
    };

    it('prefers the first X-Forwarded-For entry', async () => {
      expect(await callerFor({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, ip: '10.0.0.1' })).toBe('203.0.113.9');
    });

    it('takes the first value when the header arrives as a list', async () => {
      expect(await callerFor({ headers: { 'x-forwarded-for': ['198.51.100.7, 10.0.0.1'] }, ip: '10.0.0.1' })).toBe(
        '198.51.100.7',
      );
    });

    it('falls back to the socket address, then to a fixed placeholder', async () => {
      expect(await callerFor({ headers: {}, ip: '192.0.2.5' })).toBe('192.0.2.5');
      expect(await callerFor({ headers: {}, ip: '  ' })).toBe('unknown-caller');
    });
  });

  describe('login', () => {
    it('without two-step sign-in sets both HttpOnly cookies and returns the tokens', async () => {
      const res = response();

      const body = await controller.login({ username: 'alice.trader1', password: 'pw' }, request(), res as never);

      expect(body).toEqual({ twoFactorRequired: false, tokens: TOKENS });
      const names = res.cookie.mock.calls.map((call) => call[0]);
      expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
      expect(res.cookie.mock.calls.every((call) => call[2].httpOnly === true)).toBe(true);
    });

    it('with two-step sign-in returns the challenge and sets no cookie: there is no session yet', async () => {
      loginFlow.start.mockResolvedValue({ twoFactorRequired: true, challenge: CHALLENGE });
      const res = response();

      const body = await controller.login({ username: 'alice.trader1', password: 'pw' }, request(), res as never);

      expect(body).toEqual({ twoFactorRequired: true, challenge: CHALLENGE });
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('two-step sign-in', () => {
    it('gives the session only for a right code, in both HttpOnly cookies', async () => {
      const res = response();

      const body = await controller.verifyLogin(
        { challengeId: CHALLENGE.challengeId, code: '123456' },
        request(),
        res as never,
      );

      expect(body).toEqual(TOKENS);
      expect(loginFlow.verify).toHaveBeenCalledWith(CHALLENGE.challengeId, '123456', '10.0.0.1');
      expect(res.cookie.mock.calls.map((call) => call[0])).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
    });

    it('sets no cookie when the code is wrong', async () => {
      loginFlow.verify.mockRejectedValue(new UnauthorisedException('nope'));
      const res = response();

      await expect(
        controller.verifyLogin({ challengeId: CHALLENGE.challengeId, code: '000000' }, request(), res as never),
      ).rejects.toBeInstanceOf(UnauthorisedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('sends the code again for a challenge', async () => {
      await expect(controller.resendLoginCode({ challengeId: CHALLENGE.challengeId })).resolves.toEqual(CHALLENGE);
      expect(loginFlow.resend).toHaveBeenCalledWith(CHALLENGE.challengeId);
    });
  });

  describe('two-step sign-in switch', () => {
    const user = { userId: 1000, roles: ['CUSTOMER'], iat: 1, exp: 2 };

    it('switches it for the signed-in user, given the CSRF header on a cookie session', async () => {
      await expect(
        controller.setTwoFactor({ enabled: true }, user, request({ cookie: 'access_token=x', 'x-requested-with': 'XMLHttpRequest' })),
      ).resolves.toEqual({ id: 1000, twoFactorEnabled: true });
      expect(accountSecurity.setTwoFactor).toHaveBeenCalledWith(1000, true);
    });

    it('refuses a cookie-authenticated switch that lacks the CSRF header, and changes nothing', async () => {
      await expect(controller.setTwoFactor({ enabled: false }, user, request({ cookie: 'access_token=x' }))).rejects.toBeInstanceOf(
        UnauthorisedException,
      );
      expect(accountSecurity.setTwoFactor).not.toHaveBeenCalled();
    });

    it('accepts a bearer token without the CSRF header, as API clients send it', async () => {
      await controller.setTwoFactor({ enabled: true }, user, request({ authorization: 'Bearer abc' }));

      expect(accountSecurity.setTwoFactor).toHaveBeenCalledWith(1000, true);
    });
  });

  describe('change password', () => {
    const user = { userId: 1000, roles: ['CUSTOMER'], iat: 1, exp: 2 };
    const csrf = { 'x-requested-with': 'XMLHttpRequest' };
    const dto = { currentPassword: 'Old!Password#1', newPassword: 'N3w!Password#1' };

    it('changes it, passing on the session\'s refresh token, and sets a fresh pair of cookies', async () => {
      const res = response();

      await expect(
        controller.changePassword(dto, user, request({ ...csrf, cookie: `${REFRESH_TOKEN_COOKIE}=session-refresh` }), res as never),
      ).resolves.toEqual(TOKENS);

      expect(accountSecurity.changePassword).toHaveBeenCalledWith(1000, 'Old!Password#1', 'N3w!Password#1', 'session-refresh');
      expect(res.cookie.mock.calls.map((call) => call[0])).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('works for a client with no cookie too (no refresh token to pass)', async () => {
      await controller.changePassword(dto, user, request({ authorization: 'Bearer abc' }), response() as never);

      expect(accountSecurity.changePassword).toHaveBeenCalledWith(1000, 'Old!Password#1', 'N3w!Password#1', undefined);
    });

    it('lets a wrong password through as PWD-403 and touches no cookie', async () => {
      accountSecurity.changePassword.mockRejectedValue(new PasswordIncorrectException(2));
      const res = response();

      await expect(controller.changePassword(dto, user, request(csrf), res as never)).rejects.toBeInstanceOf(
        PasswordIncorrectException,
      );
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('clears both cookies when the tries run out: the session is over', async () => {
      accountSecurity.changePassword.mockRejectedValue(new PasswordLockedException());
      const res = response();

      await expect(controller.changePassword(dto, user, request(csrf), res as never)).rejects.toBeInstanceOf(
        PasswordLockedException,
      );
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('refuses a cookie-authenticated change that lacks the CSRF header, before looking at any password', async () => {
      await expect(
        controller.changePassword(dto, user, request({ cookie: `${REFRESH_TOKEN_COOKIE}=session-refresh` }), response() as never),
      ).rejects.toBeInstanceOf(UnauthorisedException);
      expect(accountSecurity.changePassword).not.toHaveBeenCalled();
    });
  });

  describe('forgot password', () => {
    it('starts a reset from the username and email, keyed by who is asking', async () => {
      await controller.forgotPassword({ username: 'alice.trader1', email: 'a@b.co' }, request());

      expect(passwordReset.request).toHaveBeenCalledWith('alice.trader1', 'a@b.co', '10.0.0.1');
    });

    it('resends, verifies and resets through the reset service', async () => {
      await controller.resendResetCode({ challengeId: CHALLENGE.challengeId });
      await expect(
        controller.verifyResetCode({ challengeId: CHALLENGE.challengeId, code: '123456' }, request()),
      ).resolves.toEqual({ resetToken: 'reset-token', expiresIn: 600 });
      await controller.resetPassword({ resetToken: 'reset-token', newPassword: 'N3w!Password#1' });

      expect(passwordReset.resend).toHaveBeenCalledWith(CHALLENGE.challengeId);
      expect(passwordReset.verifyCode).toHaveBeenCalledWith(CHALLENGE.challengeId, '123456', '10.0.0.1');
      expect(passwordReset.resetPassword).toHaveBeenCalledWith('reset-token', 'N3w!Password#1');
    });
  });

  describe('refresh', () => {
    it('uses the refresh cookie when the body is empty, given the CSRF header, and rotates both cookies', async () => {
      const res = response();

      await controller.refresh(
        {},
        request({ cookie: `${REFRESH_TOKEN_COOKIE}=cookie-refresh`, 'x-requested-with': 'XMLHttpRequest' }),
        res as never,
      );

      expect(authService.refresh).toHaveBeenCalledWith('cookie-refresh');
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });

    it('refuses a cookie-only refresh that lacks the CSRF header', async () => {
      await expect(
        controller.refresh({}, request({ cookie: `${REFRESH_TOKEN_COOKIE}=cookie-refresh` }), response() as never),
      ).rejects.toBeInstanceOf(UnauthorisedException);
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('refuses a refresh with neither a body token nor a cookie', async () => {
      await expect(
        controller.refresh({}, request({ 'x-requested-with': 'XMLHttpRequest' }), response() as never),
      ).rejects.toBeInstanceOf(UnauthorisedException);
    });

    it('still accepts the token in the body, as API clients send it', async () => {
      await controller.refresh({ refreshToken: 'body-refresh' }, request(), response() as never);

      expect(authService.refresh).toHaveBeenCalledWith('body-refresh');
    });
  });

  describe('logout', () => {
    it('revokes the cookie refresh token and clears both cookies', async () => {
      const res = response();

      await controller.logout(
        {},
        request({ cookie: `${REFRESH_TOKEN_COOKIE}=cookie-refresh`, 'x-requested-with': 'XMLHttpRequest' }),
        res as never,
      );

      expect(authService.logout).toHaveBeenCalledWith('cookie-refresh');
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('does not act on a cookie without the CSRF header', async () => {
      const res = response();

      await expect(
        controller.logout({}, request({ cookie: `${REFRESH_TOKEN_COOKIE}=cookie-refresh` }), res as never),
      ).rejects.toBeInstanceOf(UnauthorisedException);
      expect(authService.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('is harmless without any token: it just clears the cookies', async () => {
      const res = response();

      await controller.logout({}, request(), res as never);

      expect(authService.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('accepts a body token from an API client', async () => {
      await controller.logout({ refreshToken: 'body-refresh' }, request(), response() as never);

      expect(authService.logout).toHaveBeenCalledWith('body-refresh');
    });
  });
});
