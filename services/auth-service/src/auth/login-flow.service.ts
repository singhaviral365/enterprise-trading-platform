import { Inject, Injectable } from '@nestjs/common';
import {
  OtpDeliveryFailedException,
  OtpInvalidException,
  OtpTooManyRequestsException,
  UnauthorisedException,
} from '../common/exceptions';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { EMAIL_SENDER, EmailSender } from '../mail/email-sender';
import { loginCodeMessage, maskEmail } from '../mail/otp-messages';
import { IssuedCode, OtpService } from '../otp/otp.service';
import { OTP_SETTINGS, OtpSettings } from '../otp/otp.config';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginResponseDto, OtpChallengeDto, TokenResponseDto } from './dto';
import { LoginThrottleService } from './login-throttle.service';
import { User } from '../users/user.entity';

/**
 * Sign-in, with an optional second step. Step one checks the password. For a user who switched two-step sign-in on (Settings;
 * it is off by default) it emails a code and no session exists yet; step two checks the code and only then issues the
 * tokens. For everybody else step one issues the tokens itself. `AUTH_TWO_FACTOR_ENABLED=false` removes the option for
 * everyone.
 *
 * <ul>
 *   <li>Step one is as strict as ever (same `AUTH-401` for a wrong username or password, same throttling).</li>
 *   <li>The code goes to the address on the user's own record. The caller never supplies a destination.</li>
 *   <li>If the code cannot be sent, step one fails with `OTP-503`: a user must never be told a code is on its way when
 *       it is not.</li>
 *   <li>Guesses are throttled per caller as well as per code, so a client cannot spread them over fresh challenges.</li>
 * </ul>
 */
@Injectable()
export class LoginFlowService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly throttle: LoginThrottleService,
    private readonly logger: RedactingLogger,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(OTP_SETTINGS) private readonly settings: OtpSettings,
  ) {}

  async start(username: string, password: string, callerId: string): Promise<LoginResponseDto> {
    const user = await this.authService.authenticate(username, password, callerId);

    // A code is asked for only when two-step sign-in is offered here, this user has it on (the default), and there is a way to email it:
    // without one the user would be locked out, so the service says so in its log and signs them in on the password alone.
    if (this.settings.twoFactorEnabled && user.two_factor_enabled === true && !this.email.enabled()) {
      this.logger.warn('LoginFlowService', 'Two-step sign-in skipped: email is off, so no code can be sent', { userId: user.id });
    }
    if (!this.settings.twoFactorEnabled || user.two_factor_enabled !== true || !this.email.enabled()) {
      return { twoFactorRequired: false, tokens: await this.authService.issueTokens(user) };
    }

    const issued = await this.otpService.issue(user.id, 'LOGIN');
    await this.deliver(user, issued);
    return { twoFactorRequired: true, challenge: this.describe(user, issued) };
  }

  async verify(challengeId: string, code: string, callerId: string): Promise<TokenResponseDto> {
    const key = this.guessKey(callerId);
    if (this.throttle.isBlocked(key)) {
      throw new OtpTooManyRequestsException('Too many wrong codes. Please wait a few minutes and try again', 300);
    }

    let userId: number;
    try {
      userId = Number((await this.otpService.verify(challengeId, 'LOGIN', code)).user_id);
    } catch (error) {
      if (error instanceof OtpInvalidException) {
        this.throttle.recordFailure(key);
      }
      throw error;
    }
    this.throttle.reset(key);

    const user = await this.usersService.getUserById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }
    this.logger.log('LoginFlowService', 'Two-step sign-in completed', { userId });
    return this.authService.issueTokens(user);
  }

  async resend(challengeId: string): Promise<OtpChallengeDto> {
    const issued = await this.otpService.resend(challengeId, 'LOGIN');
    const user = await this.usersService.getUserById(Number(issued.challenge.user_id));
    if (!user) {
      throw new OtpInvalidException();
    }
    await this.deliver(user, issued);
    return this.describe(user, issued);
  }

  private async deliver(user: User, issued: IssuedCode): Promise<void> {
    const message = loginCodeMessage(issued.code, issued.expiresInSeconds);
    try {
      await this.email.send(user.email, message.subject, message.body);
    } catch (error) {
      // The reason class only: never the address, never the message.
      this.logger.warn('LoginFlowService', 'Sign-in code could not be sent', {
        userId: user.id,
        reason: error instanceof Error ? error.constructor.name : 'unknown',
      });
      throw new OtpDeliveryFailedException();
    }
  }

  private describe(user: User, issued: IssuedCode): OtpChallengeDto {
    return {
      challengeId: issued.challenge.id,
      email: maskEmail(user.email),
      expiresIn: issued.expiresInSeconds,
      resendAfter: this.settings.resendCooldownSeconds,
    };
  }

  private guessKey(callerId: string): string {
    return `otp:${callerId}`;
  }
}
