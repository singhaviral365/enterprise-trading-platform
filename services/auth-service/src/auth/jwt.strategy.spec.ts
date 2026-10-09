import { JwtStrategy } from './jwt.strategy';
import { UnauthorisedException } from '../common/exceptions';

describe('JwtStrategy', () => {
  const originalEnv = { ...process.env };
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_SECRET = 'strategy-test-secret';
    process.env.JWT_ISSUER = 'auth-service';
    strategy = new JwtStrategy();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const payload = (overrides: Record<string, unknown> = {}) => ({
    sub: 1000,
    roles: ['CUSTOMER'],
    iat: 1,
    exp: 2,
    iss: 'auth-service',
    ...overrides,
  });

  it('maps a valid payload to the authenticated user', async () => {
    await expect(strategy.validate(payload())).resolves.toEqual({
      userId: 1000,
      roles: ['CUSTOMER'],
      iat: 1,
      exp: 2,
    });
  });

  it('accepts a numeric string subject, as long as it is a whole number', async () => {
    await expect(strategy.validate(payload({ sub: '42' }))).resolves.toMatchObject({ userId: 42 });
  });

  it.each([
    ['a non-numeric subject', { sub: 'abc' }],
    ['a zero subject', { sub: 0 }],
    ['a fractional subject', { sub: 1.5 }],
    ['no subject', { sub: undefined }],
    ['no roles', { roles: undefined }],
    ['an empty role list', { roles: [] }],
    ['roles that are not a list', { roles: 'CUSTOMER' }],
    ['no issuer', { iss: undefined }],
    ['the wrong issuer', { iss: 'someone-else' }],
  ])('rejects a payload with %s', async (_label, overrides) => {
    await expect(strategy.validate(payload(overrides))).rejects.toBeInstanceOf(UnauthorisedException);
  });

  it('honours a configured issuer', async () => {
    process.env.JWT_ISSUER = 'custom-issuer';

    await expect(strategy.validate(payload({ iss: 'custom-issuer' }))).resolves.toMatchObject({ userId: 1000 });
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(UnauthorisedException);
  });

  describe('where the token is read from', () => {
    const extract = (headers: Record<string, string>) =>
      (strategy as unknown as { _jwtFromRequest: (request: unknown) => string | null })._jwtFromRequest({ headers });

    it('takes a Bearer header first', () => {
      expect(extract({ authorization: 'Bearer header.token', cookie: 'access_token=cookie.token' })).toBe('header.token');
    });

    it('falls back to the HttpOnly access_token cookie', () => {
      expect(extract({ cookie: 'theme=dark; access_token=cookie.token' })).toBe('cookie.token');
    });

    it('finds nothing without either', () => {
      expect(extract({ cookie: 'theme=dark' })).toBeNull();
    });
  });
});
