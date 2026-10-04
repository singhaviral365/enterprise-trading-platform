import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  cookieSettings,
  hasCsrfHeader,
  readCookie,
  refreshTtlSeconds,
  setAuthCookies,
} from './auth-cookies';

describe('auth cookies', () => {
  describe('readCookie', () => {
    it('finds a cookie among several, ignoring surrounding spaces', () => {
      expect(readCookie('theme=dark; access_token=abc.def.ghi ; other=1', ACCESS_TOKEN_COOKIE)).toBe('abc.def.ghi');
    });

    it('decodes percent-encoding', () => {
      expect(readCookie('refresh_token=a%2Fb', REFRESH_TOKEN_COOKIE)).toBe('a/b');
    });

    it('does not mistake a longer cookie name for the one asked for', () => {
      expect(readCookie('xaccess_token=nope; access_token_old=nope', ACCESS_TOKEN_COOKIE)).toBeUndefined();
    });

    it('returns undefined for a missing, empty or malformed header', () => {
      expect(readCookie(undefined, ACCESS_TOKEN_COOKIE)).toBeUndefined();
      expect(readCookie('', ACCESS_TOKEN_COOKIE)).toBeUndefined();
      expect(readCookie('access_token=', ACCESS_TOKEN_COOKIE)).toBeUndefined();
      expect(readCookie('access_token=%E0%A4%A', ACCESS_TOKEN_COOKIE)).toBeUndefined();
      expect(readCookie('novalue', 'novalue')).toBeUndefined();
    });

    it('accepts a header that arrived as an array', () => {
      expect(readCookie(['a=1', 'access_token=zzz'], ACCESS_TOKEN_COOKIE)).toBe('zzz');
    });
  });

  describe('hasCsrfHeader', () => {
    it('needs a non-empty X-Requested-With', () => {
      expect(hasCsrfHeader({ 'x-requested-with': 'XMLHttpRequest' })).toBe(true);
      expect(hasCsrfHeader({ 'x-requested-with': '  ' })).toBe(false);
      expect(hasCsrfHeader({})).toBe(false);
      expect(hasCsrfHeader(undefined)).toBe(false);
    });
  });

  describe('cookieSettings', () => {
    it('is strict, and insecure only outside production (so http://localhost works)', () => {
      expect(cookieSettings({ NODE_ENV: 'development' })).toEqual({ secure: false, sameSite: 'strict' });
      expect(cookieSettings({ NODE_ENV: 'production' })).toEqual({ secure: true, sameSite: 'strict' });
    });

    it('can be set explicitly', () => {
      expect(cookieSettings({ AUTH_COOKIE_SECURE: 'true', AUTH_COOKIE_SAMESITE: 'lax' })).toEqual({
        secure: true,
        sameSite: 'lax',
      });
      expect(cookieSettings({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }).secure).toBe(false);
    });

    it('ignores an unknown SameSite value, and never emits SameSite=None without Secure', () => {
      expect(cookieSettings({ AUTH_COOKIE_SAMESITE: 'bogus' }).sameSite).toBe('strict');
      expect(cookieSettings({ AUTH_COOKIE_SAMESITE: 'none', AUTH_COOKIE_SECURE: 'false' })).toEqual({
        secure: true,
        sameSite: 'none',
      });
    });
  });

  describe('refreshTtlSeconds', () => {
    it('reads JWT_REFRESH_TOKEN_EXPIRES_IN, defaulting to seven days', () => {
      expect(refreshTtlSeconds({ JWT_REFRESH_TOKEN_EXPIRES_IN: '3600' })).toBe(3600);
      expect(refreshTtlSeconds({})).toBe(604800);
      expect(refreshTtlSeconds({ JWT_REFRESH_TOKEN_EXPIRES_IN: 'nope' })).toBe(604800);
    });
  });

  describe('setAuthCookies / clearAuthCookies', () => {
    const tokens = { accessToken: 'access.jwt', refreshToken: 'refresh-token', expiresIn: 900 };

    function fakeResponse() {
      return { cookie: jest.fn(), clearCookie: jest.fn() };
    }

    it('stores both tokens HttpOnly, with the refresh token scoped to /auth', () => {
      const response = fakeResponse();

      setAuthCookies(response as never, tokens, { secure: true, sameSite: 'strict' }, 604800);

      expect(response.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, 'access.jwt', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 900 * 1000,
      });
      expect(response.cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, 'refresh-token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: REFRESH_COOKIE_PATH,
        maxAge: 604800 * 1000,
      });
    });

    it('clears both cookies on the same paths they were set on', () => {
      const response = fakeResponse();

      clearAuthCookies(response as never, { secure: false, sameSite: 'lax' });

      expect(response.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, expect.objectContaining({ path: '/', httpOnly: true }));
      expect(response.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        expect.objectContaining({ path: REFRESH_COOKIE_PATH, httpOnly: true }),
      );
    });
  });
});
