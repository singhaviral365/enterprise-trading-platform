import { ExecutionContext } from '@nestjs/common';
import * as jsonwebtoken from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UnauthorisedException } from '../common/exceptions';

describe('JwtAuthGuard', () => {
  const jwtSecret = 'guard-test-secret';
  const wrongJwtSecret = 'guard-test-wrong-secret';
  const jwtIssuer = 'auth-service';

  let guard: JwtAuthGuard;

  beforeEach(() => {
    process.env.JWT_SECRET = jwtSecret;
    process.env.JWT_ISSUER = jwtIssuer;
    guard = new JwtAuthGuard();
  });

  function createHttpExecutionContext(headers: Record<string, string>) {
    const request: { headers: Record<string, string>; user?: unknown } = { headers };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  function createAccessToken(options?: {
    secret?: string;
    exp?: number;
    iat?: number;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    return jsonwebtoken.sign(
      {
        sub: '1000',
        roles: ['CUSTOMER'],
        iat: options?.iat ?? now,
        exp: options?.exp ?? now + 900,
        iss: jwtIssuer,
      },
      options?.secret ?? jwtSecret,
      {
        algorithm: 'HS256',
      },
    );
  }

  it('accepts a valid token', () => {
    const token = createAccessToken();
    const { context, request } = createHttpExecutionContext({
      authorization: `Bearer ${token}`,
    });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({
      userId: 1000,
      roles: ['CUSTOMER'],
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
  });

  it('refuses an expired token signed with the right key', () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = createAccessToken({
      iat: now - 3600,
      exp: now - 60,
    });
    const { context } = createHttpExecutionContext({
      authorization: `Bearer ${expiredToken}`,
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorisedException);
  });

  it('refuses a wrong-signature token before reading claims', () => {
    const forgedToken = createAccessToken({ secret: wrongJwtSecret });
    const { context } = createHttpExecutionContext({
      authorization: `Bearer ${forgedToken}`,
    });
    const claimsReaderSpy = jest.spyOn(
      guard as unknown as {
        buildAuthenticatedUser: (payload: unknown) => unknown;
      },
      'buildAuthenticatedUser',
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorisedException);
    expect(claimsReaderSpy).not.toHaveBeenCalled();
  });

  it('refuses a malformed authorization header', () => {
    const { context } = createHttpExecutionContext({
      authorization: 'Token not-a-bearer-token',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorisedException);
  });
});


