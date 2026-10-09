// @nestjs/jwt 12 ships ES modules that ts-jest (CommonJS) cannot load; these services only need the type.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import {
  OtpDeliveryFailedException,
  OtpInvalidException,
  OtpTooManyRequestsException,
  RegistrationFailedException,
  ValidationFailedException,
} from '../common/exceptions';
import { OtpSettings } from '../otp/otp.config';
import { LoginThrottleService } from './login-throttle.service';
import { RegistrationFlowService } from './registration-flow.service';

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
const CHALLENGE_ID = '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11';
const DETAILS = { username: 'trader.one7', email: 'trader@example.com', password: 'Tr@dingDesk2026' };

describe('RegistrationFlowService', () => {
  let authService: { register: jest.Mock; toUserResponse: jest.Mock };
  let usersService: { createUser: jest.Mock };
  let usersRepository: { usernameExists: jest.Mock; emailExists: jest.Mock };
  let credentialsService: { hashPassword: jest.Mock };
  let otpService: { issue: jest.Mock; verify: jest.Mock; resend: jest.Mock };
  let challenges: { clearPending: jest.Mock };
  let email: { enabled: jest.Mock; send: jest.Mock };
  let throttle: LoginThrottleService;
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const build = (settings: OtpSettings = SETTINGS) =>
    new RegistrationFlowService(
      authService as never,
      usersService as never,
      usersRepository as never,
      credentialsService as never,
      otpService as never,
      challenges as never,
      throttle,
      logger as never,
      email as never,
      settings,
    );

  const pendingChallenge = (overrides: object = {}) => ({
    id: CHALLENGE_ID,
    user_id: null,
    pending_username: DETAILS.username,
    pending_email: DETAILS.email,
    pending_password_hash: 'hashed-password',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authService = {
      register: jest.fn().mockResolvedValue({ id: 5, username: DETAILS.username }),
      toUserResponse: jest.fn((user: { id: number; username: string }) => ({ id: user.id, username: user.username })),
    };
    usersService = { createUser: jest.fn().mockResolvedValue({ id: 9, username: DETAILS.username }) };
    usersRepository = {
      usernameExists: jest.fn().mockResolvedValue(false),
      emailExists: jest.fn().mockResolvedValue(false),
    };
    credentialsService = { hashPassword: jest.fn().mockResolvedValue('hashed-password') };
    otpService = {
      issue: jest.fn().mockResolvedValue({ challenge: pendingChallenge(), code: '482913', expiresInSeconds: 300 }),
      verify: jest.fn().mockResolvedValue(pendingChallenge()),
      resend: jest.fn().mockResolvedValue({ challenge: pendingChallenge(), code: '715204', expiresInSeconds: 300 }),
    };
    challenges = { clearPending: jest.fn().mockResolvedValue(undefined) };
    email = { enabled: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
    throttle = new LoginThrottleService();
  });

  describe('step one: the details', () => {
    it('creates NO login: it emails a code to the address typed and keeps the details, password hashed, in the challenge', async () => {
      const result = await build().start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1');

      expect(result).toEqual({
        verificationRequired: true,
        challenge: { challengeId: CHALLENGE_ID, email: 't***@example.com', expiresIn: 300, resendAfter: 30 },
      });
      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(credentialsService.hashPassword).toHaveBeenCalledWith(DETAILS.password);
      expect(otpService.issue).toHaveBeenCalledWith(null, 'REGISTRATION', {
        username: DETAILS.username,
        email: DETAILS.email,
        passwordHash: 'hashed-password',
      });
      const [to, subject, body] = email.send.mock.calls[0];
      expect(to).toBe(DETAILS.email);
      expect(subject).toContain('482913');
      expect(body).toContain('482913');
    });

    it('never puts the plain password, or the whole address, in the answer', async () => {
      const result = await build().start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1');

      expect(JSON.stringify(result)).not.toContain(DETAILS.password);
      expect(JSON.stringify(result)).not.toContain('trader@example.com');
    });

    it.each([
      ['username', () => usersRepository.usernameExists.mockResolvedValue(true)],
      ['email', () => usersRepository.emailExists.mockResolvedValue(true)],
    ])('refuses a taken %s with AUTH-409 and sends no code', async (_name, take) => {
      take();

      await expect(build().start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1')).rejects.toBeInstanceOf(
        RegistrationFailedException,
      );
      expect(otpService.issue).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('refuses a password that is the username, whatever its case, and sends no code', async () => {
      await expect(build().start('Trader.One7', 'trader.one7', DETAILS.email, '10.0.0.1')).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
      expect(email.send).not.toHaveBeenCalled();
    });

    it('tells the user when the code could not be sent, rather than promise one', async () => {
      email.send.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(build().start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1')).rejects.toBeInstanceOf(
        OtpDeliveryFailedException,
      );
      const logged = JSON.stringify(logger.warn.mock.calls);
      expect(logged).not.toContain(DETAILS.email);
      expect(logged).not.toContain('482913');
    });

    it('stops one caller from starting registration after registration', async () => {
      const service = build();
      for (let i = 0; i < 5; i++) {
        await service.start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1');
      }

      await expect(service.start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.1')).rejects.toBeInstanceOf(
        OtpTooManyRequestsException,
      );
      await expect(service.start(DETAILS.username, DETAILS.password, DETAILS.email, '10.0.0.2')).resolves.toBeDefined();
    });

    it('creates the login at once, as registration always did, when email verification is switched off', async () => {
      const result = await build({ ...SETTINGS, emailVerificationEnabled: false }).start(
        DETAILS.username,
        DETAILS.password,
        DETAILS.email,
        '10.0.0.1',
      );

      expect(result).toEqual({ verificationRequired: false, user: { id: 5, username: DETAILS.username } });
      expect(authService.register).toHaveBeenCalledWith(DETAILS.username, DETAILS.password, DETAILS.email);
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('step two: the code', () => {
    it('creates the login from the details that were typed, with the hash already made, and forgets them', async () => {
      const user = await build().verify(CHALLENGE_ID, '482913', '10.0.0.1');

      expect(otpService.verify).toHaveBeenCalledWith(CHALLENGE_ID, 'REGISTRATION', '482913');
      expect(usersService.createUser).toHaveBeenCalledWith(DETAILS.username, 'hashed-password', ['CUSTOMER'], DETAILS.email);
      expect(credentialsService.hashPassword).not.toHaveBeenCalled();
      expect(challenges.clearPending).toHaveBeenCalledWith(CHALLENGE_ID);
      expect(user).toEqual({ id: 9, username: DETAILS.username });
    });

    it('creates nothing for a wrong code', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());

      await expect(build().verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(OtpInvalidException);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('stops a caller who keeps guessing', async () => {
      otpService.verify.mockRejectedValue(new OtpInvalidException());
      const service = build();
      for (let i = 0; i < 5; i++) {
        await service.verify(CHALLENGE_ID, '000000', '10.0.0.1').catch(() => undefined);
      }

      await expect(service.verify(CHALLENGE_ID, '000000', '10.0.0.1')).rejects.toBeInstanceOf(OtpTooManyRequestsException);
    });

    it('refuses, and creates nothing, when the name was taken between the two steps', async () => {
      usersRepository.usernameExists.mockResolvedValue(true);

      await expect(build().verify(CHALLENGE_ID, '482913', '10.0.0.1')).rejects.toBeInstanceOf(RegistrationFailedException);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('cannot complete a challenge that carries no details', async () => {
      otpService.verify.mockResolvedValue(pendingChallenge({ pending_password_hash: null }));

      await expect(build().verify(CHALLENGE_ID, '482913', '10.0.0.1')).rejects.toBeInstanceOf(OtpInvalidException);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('emails a fresh code to the address that was typed', async () => {
      const result = await build().resend(CHALLENGE_ID);

      expect(otpService.resend).toHaveBeenCalledWith(CHALLENGE_ID, 'REGISTRATION');
      expect(email.send.mock.calls[0][0]).toBe(DETAILS.email);
      expect(email.send.mock.calls[0][2]).toContain('715204');
      expect(result.email).toBe('t***@example.com');
    });

    it('passes on a refusal for too soon, and sends nothing', async () => {
      otpService.resend.mockRejectedValue(new OtpTooManyRequestsException('wait', 20));

      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpTooManyRequestsException);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('says the code is no good for a challenge with no address, and reports a failed send as such', async () => {
      otpService.resend.mockResolvedValue({
        challenge: pendingChallenge({ pending_email: null }),
        code: '715204',
        expiresInSeconds: 300,
      });
      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpInvalidException);

      otpService.resend.mockResolvedValue({ challenge: pendingChallenge(), code: '715204', expiresInSeconds: 300 });
      email.send.mockRejectedValue(new Error('down'));
      await expect(build().resend(CHALLENGE_ID)).rejects.toBeInstanceOf(OtpDeliveryFailedException);
    });
  });
});
