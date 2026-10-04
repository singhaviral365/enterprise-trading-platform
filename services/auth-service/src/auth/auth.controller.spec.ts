// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; the controller only needs the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth-cookies';
import { UnauthorisedException } from '../common/exceptions';

const TOKENS = { accessToken: 'new.access.jwt', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 900 };

describe('AuthController session cookies', () => {
  let authService: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock };
  let controller: AuthController;

  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const request = (headers: Record<string, string> = {}) => ({ headers, ip: '10.0.0.1' }) as never;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue(TOKENS),
      refresh: jest.fn().mockResolvedValue(TOKENS),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  describe('login', () => {
    it('sets both HttpOnly cookies and still returns the token body', async () => {
      const res = response();

      const body = await controller.login({ username: 'alice.trader1', password: 'pw' }, request(), res as never);

      expect(body).toEqual(TOKENS);
      const names = res.cookie.mock.calls.map((call) => call[0]);
      expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
      expect(res.cookie.mock.calls.every((call) => call[2].httpOnly === true)).toBe(true);
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
