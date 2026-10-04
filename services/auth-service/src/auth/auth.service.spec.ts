import * as jsonwebtoken from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { UsersService, UsersRepository } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { UnauthorisedException } from '../common/exceptions';
import { LoginThrottleService } from './login-throttle.service';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {
    sign(payload: object, options?: jsonwebtoken.SignOptions) {
      return jsonwebtoken.sign(payload, process.env.JWT_SECRET || '', options);
    }
  },
}));

describe('AuthService access token contract', () => {
  const jwtSecret = 'unit-test-secret';
  const jwtIssuer = 'auth-service';
  const fixedEpochSeconds = 1790000000;

  let service: AuthService;
  let jwtService: { sign: jest.Mock };

  let usersRepository: {
    findByUsername: jest.Mock;
    findById: jest.Mock;
    usernameExists: jest.Mock;
  };
  let credentialsService: {
    hashPassword: jest.Mock;
    verifyPassword: jest.Mock;
  };
  let refreshTokensService: {
    createRefreshToken: jest.Mock;
    verifyAndConsumeRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
  };
  let redactingLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };
  let loginThrottleService: {
    isBlocked: jest.Mock;
    recordFailure: jest.Mock;
    reset: jest.Mock;
  };

  beforeEach(() => {
    process.env.JWT_SECRET = jwtSecret;
    process.env.JWT_ISSUER = jwtIssuer;
    process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '900';
    process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '604800';

    jwtService = {
      sign: jest.fn(
        (payload: string | Buffer | object, options?: jsonwebtoken.SignOptions) =>
          jsonwebtoken.sign(payload as object, jwtSecret, options),
      ),
    };

    usersRepository = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
      usernameExists: jest.fn(),
    };
    credentialsService = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
    };
    refreshTokensService = {
      createRefreshToken: jest.fn(),
      verifyAndConsumeRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
    };
    redactingLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    loginThrottleService = {
      isBlocked: jest.fn(() => false),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    };

    service = new AuthService(
      {} as UsersService,
      usersRepository as unknown as UsersRepository,
      credentialsService as unknown as CredentialsService,
      refreshTokensService as unknown as RefreshTokensService,
      jwtService as never,
      redactingLogger as unknown as RedactingLogger,
      loginThrottleService as unknown as LoginThrottleService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setupValidLoginMocks() {
    usersRepository.findByUsername.mockResolvedValue({
      id: '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f',
      username: 'trader01',
      password_hash: '$argon2id$mockedHash',
      account_id: 1,
      roles: ['CUSTOMER'],
    });
    credentialsService.verifyPassword.mockResolvedValue(true);
    refreshTokensService.createRefreshToken.mockResolvedValue({
      token: 'refresh-token-value',
      expiresAt: new Date((fixedEpochSeconds + 604800) * 1000),
    });
  }

  it('issues a token with contract claims and 15-minute expiry', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedEpochSeconds * 1000);
    setupValidLoginMocks();

    const response = await service.login('trader01', 'Password123!', 'test-caller');
    const claims = jsonwebtoken.verify(response.accessToken, jwtSecret, {
      algorithms: ['HS256'],
      issuer: jwtIssuer,
    }) as {
      sub: string;
      roles: string[];
      iat: number;
      exp: number;
      iss: string;
      [key: string]: unknown;
    };

    expect(response.expiresIn).toBe(900);
    expect(claims.sub).toBe('8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f');
    expect(claims.roles).toEqual(['CUSTOMER']);
    expect(claims.iat).toBe(fixedEpochSeconds);
    expect(claims.exp).toBe(fixedEpochSeconds + 900);
    expect(claims.iss).toBe(jwtIssuer);
  });

  it('creates a signature that verifies with the service key', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedEpochSeconds * 1000);
    setupValidLoginMocks();

    const response = await service.login('trader01', 'Password123!', 'test-caller');

    expect(() => {
      jsonwebtoken.verify(response.accessToken, jwtSecret, {
        algorithms: ['HS256'],
        issuer: jwtIssuer,
      });
    }).not.toThrow();
  });

  it('does not include claims outside the fixed contract set', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedEpochSeconds * 1000);
    setupValidLoginMocks();

    const response = await service.login('trader01', 'Password123!', 'test-caller');
    const claims = jsonwebtoken.verify(response.accessToken, jwtSecret, {
      algorithms: ['HS256'],
      issuer: jwtIssuer,
    }) as Record<string, unknown>;

    expect(Object.keys(claims).sort()).toEqual([
      'sub',
      'roles',
      'iat',
      'exp',
      'iss',
    ].sort());
  });

  describe('refresh token rotation', () => {
    function setupUserForRefresh() {
      usersRepository.findById.mockResolvedValue({
        id: '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f',
        account_id: 1,
        roles: ['CUSTOMER'],
      });
    }

    it('returns a new access token and a new refresh token', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(fixedEpochSeconds * 1000);
      setupUserForRefresh();
      refreshTokensService.verifyAndConsumeRefreshToken.mockResolvedValue(
        '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f',
      );
      refreshTokensService.createRefreshToken.mockResolvedValue({
        token: 'rotated-refresh-token-1',
        expiresAt: new Date((fixedEpochSeconds + 604800) * 1000),
      });

      const response = await service.refresh('presented-refresh-token');

      expect(response.accessToken).toBeDefined();
      expect(response.refreshToken).toBe('rotated-refresh-token-1');
      expect(response.tokenType).toBe('Bearer');
      expect(response.expiresIn).toBe(900);
      expect(refreshTokensService.verifyAndConsumeRefreshToken).toHaveBeenCalledWith(
        'presented-refresh-token',
      );
    });

    it('reusing a previously presented refresh token returns AUTH-401', async () => {
      setupUserForRefresh();
      refreshTokensService.verifyAndConsumeRefreshToken
        .mockResolvedValueOnce('8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f')
        .mockResolvedValueOnce(null);
      refreshTokensService.createRefreshToken.mockResolvedValue({
        token: 'rotated-refresh-token-2',
        expiresAt: new Date((fixedEpochSeconds + 604800) * 1000),
      });

      await service.refresh('single-use-token');

      await expect(service.refresh('single-use-token')).rejects.toBeInstanceOf(
        UnauthorisedException,
      );
    });

    it('the newly issued refresh token remains usable for the next refresh', async () => {
      setupUserForRefresh();

      const activeTokenStates = new Map<string, 'active' | 'revoked'>([
        ['old-refresh-token', 'active'],
      ]);
      let rotationCounter = 0;

      refreshTokensService.verifyAndConsumeRefreshToken.mockImplementation(
        async (token: string) => {
          const state = activeTokenStates.get(token);
          if (state !== 'active') {
            return null;
          }

          activeTokenStates.set(token, 'revoked');
          return '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f';
        },
      );

      refreshTokensService.createRefreshToken.mockImplementation(async () => {
        rotationCounter += 1;
        const token = `rotated-refresh-token-${rotationCounter}`;
        activeTokenStates.set(token, 'active');
        return {
          token,
          expiresAt: new Date((fixedEpochSeconds + 604800) * 1000),
        };
      });

      const firstRefresh = await service.refresh('old-refresh-token');
      const secondRefresh = await service.refresh(firstRefresh.refreshToken);

      expect(firstRefresh.refreshToken).toBe('rotated-refresh-token-1');
      expect(secondRefresh.refreshToken).toBe('rotated-refresh-token-2');
      expect(secondRefresh.refreshToken).not.toBe(firstRefresh.refreshToken);
    });
  });

  describe('registration rules', () => {
    it.each([
      ['priya.menon.long', 'priya.menon.long'],
      ['priya.menon.long', 'PRIYA.MENON.LONG'],
      ['priya.menon.long', '  priya.menon.long  '],
    ])('rejects %s with a password equal to the username (%p) as VAL-422', async (username, password) => {
      await expect(service.register(username, password)).rejects.toMatchObject({
        response: { errorCode: 'VAL-422', message: 'Password must be different from the username' },
      });
      expect(usersRepository.usernameExists).not.toHaveBeenCalled();
      expect(credentialsService.hashPassword).not.toHaveBeenCalled();
    });
  });

  describe('login hardening', () => {
    async function captureUnauthorised(
      run: () => Promise<unknown>,
    ): Promise<UnauthorisedException> {
      try {
        await run();
        throw new Error('Expected UnauthorisedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorisedException);
        return error as UnauthorisedException;
      }
    }

    it('returns the same AUTH-401 status and body for unknown user and wrong password', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);

      usersRepository.findByUsername.mockResolvedValueOnce(null);
      const unknownUserFailure = await captureUnauthorised(() =>
        service.login('missing.user', 'WrongPassword123!', 'caller-1'),
      );

      usersRepository.findByUsername.mockResolvedValueOnce({
        id: 1001,
        username: 'known.user',
        password_hash: '$argon2id$known-hash',
        roles: ['CUSTOMER'],
      });
      const wrongPasswordFailure = await captureUnauthorised(() =>
        service.login('known.user', 'WrongPassword123!', 'caller-1'),
      );

      expect(unknownUserFailure.getStatus()).toBe(wrongPasswordFailure.getStatus());
      expect(unknownUserFailure.getResponse()).toEqual(
        wrongPasswordFailure.getResponse(),
      );
    });

    it('does comparable work for unknown user and wrong password paths', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);

      usersRepository.findByUsername.mockResolvedValueOnce(null);
      await service
        .login('missing.user', 'WrongPassword123!', 'caller-A')
        .catch(() => null);

      usersRepository.findByUsername.mockResolvedValueOnce({
        id: 1002,
        username: 'known.user',
        password_hash: '$argon2id$known-hash',
        roles: ['CUSTOMER'],
      });
      await service
        .login('known.user', 'WrongPassword123!', 'caller-B')
        .catch(() => null);

      expect(credentialsService.verifyPassword).toHaveBeenCalledTimes(2);
      expect(loginThrottleService.isBlocked).toHaveBeenCalledTimes(2);
      expect(loginThrottleService.recordFailure).toHaveBeenCalledTimes(2);
      expect(loginThrottleService.reset).not.toHaveBeenCalled();

      const [firstCallArgs, secondCallArgs] = credentialsService.verifyPassword.mock.calls;
      expect(firstCallArgs[0]).toBe('WrongPassword123!');
      expect(secondCallArgs[0]).toBe('WrongPassword123!');
    });

    it('returns AUTH-401 when throttle blocks the caller even with valid credentials', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 1003,
        username: 'blocked.user',
        password_hash: '$argon2id$known-hash',
        roles: ['CUSTOMER'],
      });
      credentialsService.verifyPassword.mockResolvedValue(true);
      loginThrottleService.isBlocked.mockReturnValue(true);

      await expect(
        service.login('blocked.user', 'Password123!', 'caller-throttled'),
      ).rejects.toBeInstanceOf(UnauthorisedException);

      expect(loginThrottleService.recordFailure).toHaveBeenCalledWith(
        'caller-throttled',
      );
      expect(loginThrottleService.reset).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      await service.logout('presented-refresh-token');

      expect(refreshTokensService.revokeRefreshToken).toHaveBeenCalledWith('presented-refresh-token');
    });
  });
});
