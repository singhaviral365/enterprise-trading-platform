// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; these services only need the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import {
  OtpDeliveryFailedException,
  PasswordIncorrectException,
  PasswordLockedException,
  PasswordReuseException,
  UnauthorisedException,
} from '../common/exceptions';
import { OtpSettings } from '../otp/otp.config';
import { AccountSecurityService } from './account-security.service';
import { PasswordAttemptsService } from './password-attempts.service';

const SETTINGS: OtpSettings = {
  twoFactorEnabled: true,
  emailVerificationEnabled: true,
  codeTtlSeconds: 300,
  resetTtlSeconds: 600,
  maxAttempts: 5,
  resendCooldownSeconds: 30,
  maxSends: 3,
  codeLength: 6,
};
const USER = { id: 1010, username: 'singh_aviral365', email: 'a@b.co', password_hash: 'old-hash', two_factor_enabled: false };
const TOKENS = { accessToken: 'a', refreshToken: 'r2', tokenType: 'Bearer', expiresIn: 900 };

describe('AccountSecurityService', () => {
  let authService: { setNewPassword: jest.Mock; issueTokens: jest.Mock; toUserResponse: jest.Mock };
  let usersService: { getUserById: jest.Mock; setTwoFactorEnabled: jest.Mock };
  let credentialsService: { verifyPassword: jest.Mock };
  let refreshTokensService: { revokeRefreshToken: jest.Mock };
  let attempts: PasswordAttemptsService;
  let email: { enabled: jest.Mock; send: jest.Mock };
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const build = (settings: OtpSettings = SETTINGS) =>
    new AccountSecurityService(
      authService as never,
      usersService as never,
      credentialsService as never,
      refreshTokensService as never,
      attempts,
      logger as never,
      email as never,
      settings,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    authService = {
      setNewPassword: jest.fn().mockResolvedValue(USER),
      issueTokens: jest.fn().mockResolvedValue(TOKENS),
      toUserResponse: jest.fn((user: { two_factor_enabled: boolean }) => ({ twoFactorEnabled: user.two_factor_enabled })),
    };
    usersService = {
      getUserById: jest.fn().mockResolvedValue(USER),
      setTwoFactorEnabled: jest.fn().mockResolvedValue(undefined),
    };
    credentialsService = { verifyPassword: jest.fn().mockResolvedValue(true) };
    refreshTokensService = { revokeRefreshToken: jest.fn().mockResolvedValue(undefined) };
    attempts = new PasswordAttemptsService();
    email = { enabled: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
  });

  describe('two-step sign-in switch', () => {
    it('switches it on for the user', async () => {
      const result = await build().setTwoFactor(1010, true);

      expect(usersService.setTwoFactorEnabled).toHaveBeenCalledWith(1010, true);
      expect(result).toEqual({ twoFactorEnabled: true });
    });

    it('switches it off, even when email is not available: turning it off never locks anybody out', async () => {
      email.enabled.mockReturnValue(false);

      const result = await build().setTwoFactor(1010, false);

      expect(usersService.setTwoFactorEnabled).toHaveBeenCalledWith(1010, false);
      expect(result).toEqual({ twoFactorEnabled: false });
    });

    it.each([
      ['email is not available', () => email.enabled.mockReturnValue(false), SETTINGS],
      ['it is not offered here', () => undefined, { ...SETTINGS, twoFactorEnabled: false }],
    ])('refuses to switch it ON when %s, so nobody locks themselves out', async (_name, arrange, settings) => {
      arrange();

      await expect(build(settings).setTwoFactor(1010, true)).rejects.toBeInstanceOf(OtpDeliveryFailedException);
      expect(usersService.setTwoFactorEnabled).not.toHaveBeenCalled();
    });

    it('refuses a user that no longer exists', async () => {
      usersService.getUserById.mockResolvedValue(null);

      await expect(build().setTwoFactor(1010, true)).rejects.toBeInstanceOf(UnauthorisedException);
    });
  });

  describe('changing the password', () => {
    it('changes it for a right current password, keeps the user signed in here with a fresh pair, and mails a notice', async () => {
      const tokens = await build().changePassword(1010, 'Old!Password#1', 'N3w!Password#1', 'session-refresh');
      await flush();

      expect(credentialsService.verifyPassword).toHaveBeenCalledWith('Old!Password#1', 'old-hash');
      expect(authService.setNewPassword).toHaveBeenCalledWith(1010, 'N3w!Password#1');
      expect(authService.issueTokens).toHaveBeenCalledWith(USER);
      expect(tokens).toEqual(TOKENS);
      expect(email.send.mock.calls[0][0]).toBe('a@b.co');
      expect(email.send.mock.calls[0][1]).toContain('password was changed');
    });

    it('says how many tries are left after a wrong current password, and changes nothing', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);
      const service = build();

      const first = await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch((e) => e);
      const second = await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch((e) => e);

      expect(first).toBeInstanceOf(PasswordIncorrectException);
      expect(first.attemptsLeft).toBe(2);
      expect(second.attemptsLeft).toBe(1);
      expect(authService.setNewPassword).not.toHaveBeenCalled();
      expect(refreshTokensService.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it('ends the session on the THIRD wrong current password', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);
      const service = build();
      await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch(() => undefined);
      await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch(() => undefined);

      await expect(service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh')).rejects.toBeInstanceOf(
        PasswordLockedException,
      );

      expect(refreshTokensService.revokeRefreshToken).toHaveBeenCalledWith('session-refresh');
      expect(authService.setNewPassword).not.toHaveBeenCalled();
    });

    it('stays locked once the tries are used up, even for the RIGHT password: the ended session cannot go on guessing', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);
      const service = build();
      for (let i = 0; i < 3; i++) {
        await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch(() => undefined);
      }
      credentialsService.verifyPassword.mockResolvedValue(true);
      credentialsService.verifyPassword.mockClear();

      await expect(service.changePassword(1010, 'Old!Password#1', 'N3w!Password#1', 'session-refresh')).rejects.toBeInstanceOf(
        PasswordLockedException,
      );

      expect(credentialsService.verifyPassword).not.toHaveBeenCalled();
      expect(authService.setNewPassword).not.toHaveBeenCalled();
    });

    it('counts the tries per session: another session of the same user starts afresh', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);
      const service = build();
      for (let i = 0; i < 3; i++) {
        await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-one').catch(() => undefined);
      }

      const other = await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-two').catch((e) => e);

      expect(other).toBeInstanceOf(PasswordIncorrectException);
      expect(other.attemptsLeft).toBe(2);
    });

    it('counts the tries per user when the request carries no refresh token, and has nothing to revoke', async () => {
      credentialsService.verifyPassword.mockResolvedValue(false);
      const service = build();
      for (let i = 0; i < 2; i++) {
        await service.changePassword(1010, 'nope', 'N3w!Password#1').catch(() => undefined);
      }

      await expect(service.changePassword(1010, 'nope', 'N3w!Password#1')).rejects.toBeInstanceOf(PasswordLockedException);
      expect(refreshTokensService.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it('forgets the wrong tries after a right change', async () => {
      credentialsService.verifyPassword.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      const service = build();
      await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch(() => undefined);
      await service.changePassword(1010, 'nope', 'N3w!Password#1', 'session-refresh').catch(() => undefined);
      credentialsService.verifyPassword.mockResolvedValue(true);

      await service.changePassword(1010, 'Old!Password#1', 'N3w!Password#1', 'session-refresh');

      expect(service.attemptsLeft(1010, 'session-refresh')).toBe(3);
    });

    it('refuses the same password again with PWD-422, without counting it as a wrong guess', async () => {
      const service = build();

      await expect(service.changePassword(1010, 'Same!Password1', 'Same!Password1', 'session-refresh')).rejects.toBeInstanceOf(
        PasswordReuseException,
      );

      expect(authService.setNewPassword).not.toHaveBeenCalled();
      expect(service.attemptsLeft(1010, 'session-refresh')).toBe(3);
    });

    it('lets the other checks on the new password (the username) come through, not counting them either', async () => {
      authService.setNewPassword.mockRejectedValue(new Error('Password must be different from the username'));
      const service = build();

      await expect(service.changePassword(1010, 'Old!Password#1', 'singh_aviral365', 'session-refresh')).rejects.toThrow(
        'different from the username',
      );
      expect(service.attemptsLeft(1010, 'session-refresh')).toBe(3);
      expect(authService.issueTokens).not.toHaveBeenCalled();
    });

    it('does not mail a notice when email is not available, and does not fail because of it', async () => {
      email.enabled.mockReturnValue(false);

      await expect(build().changePassword(1010, 'Old!Password#1', 'N3w!Password#1', 'r')).resolves.toEqual(TOKENS);
      await flush();

      expect(email.send).not.toHaveBeenCalled();
    });

    it('is not held up, and does not fail, when the notice cannot be sent', async () => {
      email.send.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(build().changePassword(1010, 'Old!Password#1', 'N3w!Password#1', 'r')).resolves.toEqual(TOKENS);
      await flush();

      expect(logger.warn).toHaveBeenCalledWith(
        'AccountSecurityService',
        'Password-changed notice could not be sent',
        { reason: 'Error' },
      );
    });

    it('refuses a user that no longer exists', async () => {
      usersService.getUserById.mockResolvedValue(null);

      await expect(build().changePassword(1010, 'a', 'b')).rejects.toBeInstanceOf(UnauthorisedException);
    });
  });
});
