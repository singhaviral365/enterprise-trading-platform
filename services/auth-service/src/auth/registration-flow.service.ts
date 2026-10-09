import { Inject, Injectable } from '@nestjs/common';
import {
  OtpDeliveryFailedException,
  OtpInvalidException,
  OtpTooManyRequestsException,
  RegistrationFailedException,
  ValidationFailedException,
} from '../common/exceptions';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { CredentialsService } from '../credentials/credentials.service';
import { EMAIL_SENDER, EmailSender } from '../mail/email-sender';
import { maskEmail, registrationCodeMessage } from '../mail/otp-messages';
import { OTP_SETTINGS, OtpSettings } from '../otp/otp.config';
import { IssuedCode, OtpService } from '../otp/otp.service';
import { OtpChallengesRepository } from '../otp/otp-challenges.repository';
import { UsersRepository, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { OtpChallengeDto, RegisterResponseDto, UserResponseDto } from './dto';
import { LoginThrottleService } from './login-throttle.service';

/**
 * Registration with the email checked first. Step one takes the details and emails a six-digit code to the ADDRESS THE PERSON
 * TYPED, and creates nothing: no user exists yet. The details wait, with the password already hashed, in the challenge. Step
 * two takes the code; only a right one creates the login. An address nobody can read therefore never becomes a login, and
 * nobody can register with someone else's address.
 *
 * <ul>
 *   <li>The checks of the old one-step registration are kept: the password must differ from the username, and a taken
 *       username or email is `AUTH-409`. They are checked again when the code is right, in case the name was taken
 *       meanwhile.</li>
 *   <li>The typed details are cleared from the challenge as soon as they have become a user.</li>
 *   <li>Starting is throttled per caller, and guesses are throttled per caller as for sign-in.</li>
 *   <li>With `AUTH_EMAIL_VERIFICATION_ENABLED=false` step one creates the login at once, as registration always did.</li>
 * </ul>
 */
@Injectable()
export class RegistrationFlowService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly credentialsService: CredentialsService,
    private readonly otpService: OtpService,
    private readonly challenges: OtpChallengesRepository,
    private readonly throttle: LoginThrottleService,
    private readonly logger: RedactingLogger,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(OTP_SETTINGS) private readonly settings: OtpSettings,
  ) {}

  async start(username: string, password: string, email: string, callerId: string): Promise<RegisterResponseDto> {
    if (!this.settings.emailVerificationEnabled) {
      return { verificationRequired: false, user: await this.authService.register(username, password, email) };
    }

    const startKey = `register:${callerId}`;
    if (this.throttle.isBlocked(startKey)) {
      throw new OtpTooManyRequestsException('Too many attempts. Please wait a few minutes and try again', 300);
    }
    this.throttle.recordFailure(startKey);

    if (password.trim().toLowerCase() === username.trim().toLowerCase()) {
      throw new ValidationFailedException('Password must be different from the username');
    }
    await this.assertAvailable(username, email);

    const passwordHash = await this.credentialsService.hashPassword(password);
    const issued = await this.otpService.issue(null, 'REGISTRATION', { username, email, passwordHash });
    await this.deliver(email, issued);
    this.logger.log('RegistrationFlowService', 'Registration is waiting for its email code', {
      challengeId: issued.challenge.id,
    });
    return { verificationRequired: true, challenge: this.describe(email, issued) };
  }

  async verify(challengeId: string, code: string, callerId: string): Promise<UserResponseDto> {
    const key = `otp:${callerId}`;
    if (this.throttle.isBlocked(key)) {
      throw new OtpTooManyRequestsException('Too many wrong codes. Please wait a few minutes and try again', 300);
    }

    let challenge;
    try {
      challenge = await this.otpService.verify(challengeId, 'REGISTRATION', code);
    } catch (error) {
      if (error instanceof OtpInvalidException) {
        this.throttle.recordFailure(key);
      }
      throw error;
    }
    this.throttle.reset(key);

    const { pending_username: username, pending_email: email, pending_password_hash: passwordHash } = challenge;
    if (!username || !email || !passwordHash) {
      // A registration challenge always carries its details; one that does not cannot be completed.
      throw new OtpInvalidException();
    }

    await this.assertAvailable(username, email);
    const user = await this.usersService.createUser(username, passwordHash, ['CUSTOMER'], email);
    await this.challenges.clearPending(challenge.id);
    this.logger.log('RegistrationFlowService', 'Email verified and login created', { userId: user.id, username });
    return this.authService.toUserResponse(user);
  }

  async resend(challengeId: string): Promise<OtpChallengeDto> {
    const issued = await this.otpService.resend(challengeId, 'REGISTRATION');
    const email = issued.challenge.pending_email;
    if (!email) {
      throw new OtpInvalidException();
    }
    await this.deliver(email, issued);
    return this.describe(email, issued);
  }

  /** The old one-step registration's answer for a name or address that is taken: `AUTH-409`, nothing more. */
  private async assertAvailable(username: string, email: string): Promise<void> {
    const taken =
      (await this.usersRepository.usernameExists(username)) || (await this.usersRepository.emailExists(email));
    if (taken) {
      this.logger.warn('RegistrationFlowService', 'Registration refused: username or email already taken', { username });
      throw new RegistrationFailedException('Registration failed');
    }
  }

  private async deliver(to: string, issued: IssuedCode): Promise<void> {
    const message = registrationCodeMessage(issued.code, issued.expiresInSeconds);
    try {
      await this.email.send(to, message.subject, message.body);
    } catch (error) {
      this.logger.warn('RegistrationFlowService', 'Registration code could not be sent', {
        reason: error instanceof Error ? error.constructor.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new OtpDeliveryFailedException();
    }
  }

  private describe(email: string, issued: IssuedCode): OtpChallengeDto {
    return {
      challengeId: issued.challenge.id,
      email: maskEmail(email),
      expiresIn: issued.expiresInSeconds,
      resendAfter: this.settings.resendCooldownSeconds,
    };
  }
}
