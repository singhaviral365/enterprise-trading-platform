// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; these services only need the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { OtpInvalidException, OtpTooManyRequestsException, PasswordReuseException } from '../common/exceptions';
import { OtpSettings } from '../otp/otp.config';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordResetService } from './password-reset.service';

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
const USER = { id: 1010, username: 'singh_aviral365', email: 'Aviralsingh00028@gmail.com' };
const CHALLENGE_ID = '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11';

describe('PasswordResetService', () => {
  let authService: { setNewPassword: jest.Mock };
  let usersService: { getUserByUsername: jest.Mock; getUserById: jest.Mock };
  let otpService: {
    issue: jest.Mock;
    verify: jest.Mock;
    resend: jest.Mock;
    issueResetToken: jest.Mock;
    peekResetToken: jest.Mock;
    redeemResetToken: jest.Mock;
  };
  let email: { enabled: jest.Mock; send: jest.Mock };
  let throttle: LoginThrottleService;
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const build = () =>
    new PasswordResetService(
      authService as never,
      usersService as never,
      otpService as never,
      throttle,
      logger as never,
      email as never,
      SETTINGS,
    );
  const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
    authService = { setNewPassword: jest.fn().mockResolvedValue(USER) };
    usersService = {
      getUserByUsername: jest.fn().mockResolvedValue(USER),
      getUserById: jest.fn().mockResolvedValue(USER),
    };
    otpService = {
      issue: jest.fn().mockResolvedValue({
        challenge: { id: CHALLENGE_ID, user_id: USER.id },
        code: '482913',
        expiresInSeconds: 600,
      }),
      verify: jest.fn().mockResolvedValue({ id: CHALLENGE_ID, user_id: USER.id }),
      resend: jest.fn().mockResolvedValue({
        challenge: { id: CHALLENGE_ID, user_id: USER.id },
        code: '715204',
        expiresInSeconds: 600,
      }),
      issueResetToken: jest.fn().mockResolvedValue({ token: 'reset-token', expiresInSeconds: 600 }),
      peekResetToken: jest.fn().mockResolvedValue({ id: CHALLENGE_ID, user_id: USER.id }),
      redeemResetToken: jest.fn().mockResolvedValue({ id: CHALLENGE_ID, user_id: USER.id }),
    };
    email = { enabled: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
    throttle = new LoginThrottleService();
  });

  describe('asking for a reset', () => {
    it('emails a code to the address on the account when the username and email match (ignoring case)', async () => {
      const result = await build().request('singh_aviral365', ' aviralSingh00028@GMAIL.com ', '10.0.0.1');
      await flushBackground();

      expect(result).toEqual({ challengeId: CHALLENGE_ID, expiresIn: 600, resendAfter: 30 });
      expect(otpService.issue).toHaveBeenCalledWith(USER.id, 'PASSWORD_RESET');
      const [to, , body] = email.send.mock.calls[0];
      expect(to).toBe(USER.email);
      expect(body).toContain('482913');
    });

    it('answers a wrong email exactly like a right one, but sends nothing and makes no challenge', async () => {
      const result = await build().request('singh_aviral365', 'someone.else@example.com', '10.0.0.1');
      await flushBackground();

      expect(Object.keys(result).sort()).toEqual(['challengeId', 'expiresIn', 'resendAfter']);
      expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.expiresIn).toBe(600);
      expect(otpService.issue).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('answers an unknown username the same way too', async () => {
      usersService.getUserByUsername.mockResolvedValue(null);

      const result = await build().request('nobody.here1', 'a@b.co', '10.0.0.1');

      expect(Object.keys(result).sort()).toEqual(['challengeId', 'expiresIn', 'resendAfter']);
      expect(otpService.issue).not.toHaveBeenCalled();
    });

    it('does not wait for the mail server, and does not fail when it is down', async () => {
      email.send.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(build().request('singh_aviral365', USER.email, '10.0.0.1')).resolves.toBeDefined();
      await flushBackground();

      expect(logger.warn).toHaveBeenCalledWith('PasswordResetService', 'Email could not be sent', {
        reason: 'Error',
      });
    });

    it('stops one caller from asking again and again', async () => {
      const service = build();
      for (let i = 0; i < 5; i++) {
        await service.request('singh_aviral365', USER.email, '10.0.0.1');
      }

      await expect(service.request('singh_aviral365', USER.email, '10.0.0.1')).rejects.toBeInstanceOf(
        OtpTooManyRequestsException,
      );
      await expect(service.request('singh_aviral365', USER.email, '10.0.0.9')).resolves.toBeDefined();
    });
  });

  describe('resending', () => {
    it('emails a fresh code for a real challenge', async () => {
      await build().resend(CHALLENGE_ID);
      await flushBackground();

      expect(email.send.mock.calls[0][2]).toContain('715204');
    });

    it.each([
      ['an unknown or used challenge', new OtpInvalidException()],
      ['one asked for too soon', new OtpTooManyRequestsException('wait', 20)],
    ])('answers %s like a success, so it does not reveal that it is real', async (_name, failure) => {
      otpService.resend.mockRejectedValue(failure);

      await expect(build().resend(CHALLENGE_ID)).resolves.toEqual({
        challengeId: CHALLENGE_ID,
        expiresIn: 600,
        resendAfter: 30,
      });
      expect(email.send).not.toHaveBeenCalled();
    });

    it('lets a genuine fault through', async () => {
      otpService.resend.mockRejectedValue(new Error('database down'));

      await expect(build().resend(CHALLENGE_ID)).rejects.toThrow('database down');
    });
  });

  describe('verifying the code', () => {
    it('trades a right code for a one-time reset token', async () => {
      await expect(build().verifyCode(CHALLENGE_ID, '482913', '10.0.0.1')).resolves.toEqual({
        resetToken: 'reset-token',
        expiresIn: 600,
      });
      expect(otpService.verify).toHaveBeenCalledWith(CHALLENGE_ID, 'PASSWORD_RESET', '482913');
      expect(otpService.issueResetToken).toHaveBeenCalledWith(CHALLENGE_ID);
    });

    it('gives no token for a wrong code', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());

      await expect(build().verifyCode(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(OtpInvalidException);
      expect(otpService.issueResetToken).not.toHaveBeenCalled();
    });

    it('stops a caller who keeps guessing', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());
      const service = build();
      for (let i = 0; i < 5; i++) {
        await service.verifyCode(CHALLENGE_ID, '000000', '10.0.0.1').catch(() => undefined);
      }

      await expect(service.verifyCode(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(
        OtpTooManyRequestsException,
      );
    });
  });

  describe('setting the new password', () => {
    it('looks at the token, checks the password, spends the token last, and tells the owner', async () => {
      const order: string[] = [];
      otpService.peekResetToken.mockImplementation(async () => {
        order.push('peek');
        return { id: CHALLENGE_ID, user_id: USER.id };
      });
      otpService.redeemResetToken.mockImplementation(async () => {
        order.push('redeem');
      });
      authService.setNewPassword.mockImplementation(async (_id: number, _pw: string, beforeApply: () => Promise<void>) => {
        order.push('checks');
        await beforeApply();
        order.push('apply');
        return USER;
      });

      await build().resetPassword('reset-token', 'N3w!Password#1');
      await flushBackground();

      expect(order).toEqual(['peek', 'checks', 'redeem', 'apply']);
      expect(authService.setNewPassword).toHaveBeenCalledWith(USER.id, 'N3w!Password#1', expect.any(Function));
      expect(email.send.mock.calls[0][0]).toBe(USER.email);
      expect(email.send.mock.calls[0][1]).toContain('password was changed');
    });

    it('does not spend the token when the password is refused, so another can be tried', async () => {
      authService.setNewPassword.mockRejectedValue(new PasswordReuseException());

      await expect(build().resetPassword('reset-token', 'Same!Password1')).rejects.toBeInstanceOf(
        PasswordReuseException,
      );
      expect(otpService.redeemResetToken).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('refuses a token that is wrong, expired or used, before touching the password', async () => {
      otpService.peekResetToken.mockRejectedValue(new OtpInvalidException());

      await expect(build().resetPassword('stale', 'N3w!Password#1')).rejects.toBeInstanceOf(OtpInvalidException);
      expect(authService.setNewPassword).not.toHaveBeenCalled();
    });
  });
});
