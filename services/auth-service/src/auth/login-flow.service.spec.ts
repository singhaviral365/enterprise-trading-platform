// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; these services only need the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import {
  OtpDeliveryFailedException,
  OtpInvalidException,
  OtpTooManyRequestsException,
  UnauthorisedException,
} from '../common/exceptions';
import { OtpSettings } from '../otp/otp.config';
import { LoginFlowService } from './login-flow.service';
import { LoginThrottleService } from './login-throttle.service';

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
const USER = { id: 1010, username: 'singh_aviral365', email: 'aviralsingh00028@gmail.com', two_factor_enabled: true };
const TOKENS = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };
const CHALLENGE_ID = '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11';

describe('LoginFlowService', () => {
  let authService: { authenticate: jest.Mock; issueTokens: jest.Mock };
  let usersService: { getUserById: jest.Mock };
  let otpService: { issue: jest.Mock; verify: jest.Mock; resend: jest.Mock };
  let email: { enabled: jest.Mock; send: jest.Mock };
  let throttle: LoginThrottleService;
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const build = (settings: OtpSettings = SETTINGS) =>
    new LoginFlowService(
      authService as never,
      usersService as never,
      otpService as never,
      throttle,
      logger as never,
      email as never,
      settings,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    authService = {
      authenticate: jest.fn().mockResolvedValue(USER),
      issueTokens: jest.fn().mockResolvedValue(TOKENS),
    };
    usersService = { getUserById: jest.fn().mockResolvedValue(USER) };
    otpService = {
      issue: jest.fn().mockResolvedValue({
        challenge: { id: CHALLENGE_ID, user_id: USER.id },
        code: '482913',
        expiresInSeconds: 300,
      }),
      verify: jest.fn().mockResolvedValue({ id: CHALLENGE_ID, user_id: USER.id }),
      resend: jest.fn().mockResolvedValue({
        challenge: { id: CHALLENGE_ID, user_id: USER.id },
        code: '715204',
        expiresInSeconds: 300,
      }),
    };
    email = { enabled: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
    throttle = new LoginThrottleService();
  });

  describe('step one: the password', () => {
    it('emails a code and issues no tokens', async () => {
      const result = await build().start('singh_aviral365', 'pw', '10.0.0.1');

      expect(result).toEqual({
        twoFactorRequired: true,
        challenge: { challengeId: CHALLENGE_ID, email: 'a***@gmail.com', expiresIn: 300, resendAfter: 30 },
      });
      expect(authService.issueTokens).not.toHaveBeenCalled();
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('sends the code to the address on the user record, and only there', async () => {
      await build().start('singh_aviral365', 'pw', '10.0.0.1');

      const [to, subject, body] = email.send.mock.calls[0];
      expect(to).toBe('aviralsingh00028@gmail.com');
      expect(subject).toContain('482913');
      expect(body).toContain('482913');
    });

    it('never reveals the full address in the answer', async () => {
      const result = await build().start('singh_aviral365', 'pw', '10.0.0.1');

      expect(JSON.stringify(result)).not.toContain('aviralsingh00028');
    });

    it('signs a user in at once when they have NOT switched two-step sign-in on, and sends nothing', async () => {
      authService.authenticate.mockResolvedValue({ ...USER, two_factor_enabled: false });

      const result = await build().start('singh_aviral365', 'pw', '10.0.0.1');

      expect(result).toEqual({ twoFactorRequired: false, tokens: TOKENS });
      expect(authService.issueTokens).toHaveBeenCalledWith({ ...USER, two_factor_enabled: false });
      expect(otpService.issue).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('treats a user with no setting recorded as not asking for a code', async () => {
      const { two_factor_enabled: _unused, ...withoutSetting } = USER;
      authService.authenticate.mockResolvedValue(withoutSetting);

      const result = await build().start('singh_aviral365', 'pw', '10.0.0.1');

      expect(result.twoFactorRequired).toBe(false);
    });

    it('issues a session at once, even for a user who switched it on, when two-step sign-in is not offered here', async () => {
      const result = await build({ ...SETTINGS, twoFactorEnabled: false }).start('singh_aviral365', 'pw', '10.0.0.1');

      expect(result).toEqual({ twoFactorRequired: false, tokens: TOKENS });
      expect(otpService.issue).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('emails nothing for a wrong password, which is the same refusal as ever', async () => {
      authService.authenticate.mockRejectedValue(new UnauthorisedException('Unauthorised'));

      await expect(build().start('singh_aviral365', 'bad', '10.0.0.1')).rejects.toBeInstanceOf(UnauthorisedException);
      expect(otpService.issue).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('tells the user when the code could not be sent, rather than promise one', async () => {
      email.send.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1025'));

      await expect(build().start('singh_aviral365', 'pw', '10.0.0.1')).rejects.toBeInstanceOf(
        OtpDeliveryFailedException,
      );
      const logged = JSON.stringify(logger.warn.mock.calls);
      expect(logged).not.toContain('aviralsingh00028');
      expect(logged).not.toContain('482913');
    });
  });

  describe('step two: the code', () => {
    it('issues the tokens for a right code', async () => {
      await expect(build().verify(CHALLENGE_ID, '482913', '10.0.0.1')).resolves.toEqual(TOKENS);
      expect(otpService.verify).toHaveBeenCalledWith(CHALLENGE_ID, 'LOGIN', '482913');
      expect(authService.issueTokens).toHaveBeenCalledWith(USER);
    });

    it('issues nothing for a wrong code', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());

      await expect(build().verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(OtpInvalidException);
      expect(authService.issueTokens).not.toHaveBeenCalled();
    });

    it('stops a caller who keeps guessing, across new challenges, then lets them back in after a good code', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());
      const flow = build();
      for (let i = 0; i < 5; i++) {
        await expect(flow.verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(OtpInvalidException);
      }

      await expect(flow.verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(
        OtpTooManyRequestsException,
      );
      // another caller is unaffected
      otpService.verify.mockResolvedValue({ id: CHALLENGE_ID, user_id: USER.id });
      await expect(flow.verify(CHALLENGE_ID, '482913', '10.0.0.2')).resolves.toEqual(TOKENS);
    });

    it('does not count a failure that is not a wrong code against the caller', async () => {
      otpService.verify.mockRejectedValue(new Error('database down'));
      const flow = build();

      for (let i = 0; i < 6; i++) {
        await expect(flow.verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toThrow('database down');
      }
    });

    it('refuses when the user behind a right code has been removed', async () => {
      usersService.getUserById.mockResolvedValue(null);

      await expect(build().verify(CHALLENGE_ID, '482913', '10.0.0.1')).rejects.toBeInstanceOf(UnauthorisedException);
      expect(authService.issueTokens).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('emails a fresh code and describes the challenge again', async () => {
      const result = await build().resend(CHALLENGE_ID);

      expect(otpService.resend).toHaveBeenCalledWith(CHALLENGE_ID, 'LOGIN');
      expect(email.send.mock.calls[0][2]).toContain('715204');
      expect(result.email).toBe('a***@gmail.com');
    });

    it('passes the refusal on when it is too soon', async () => {
      otpService.resend.mockRejectedValue(new OtpTooManyRequestsException('wait', 20));

      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpTooManyRequestsException);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('says the code is no good when its user is gone', async () => {
      usersService.getUserById.mockResolvedValue(null);

      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('reports a failed send as such', async () => {
      email.send.mockRejectedValue(new Error('down'));

      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpDeliveryFailedException);
    });
  });
});
