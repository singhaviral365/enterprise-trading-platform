import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { OtpInvalidException, OtpTooManyRequestsException } from '../common/exceptions';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { EMAIL_SENDER, EmailSender } from '../mail/email-sender';
import { passwordChangedMessage, passwordResetCodeMessage } from '../mail/otp-messages';
import { IssuedCode, OtpService } from '../otp/otp.service';
import { OTP_SETTINGS, OtpSettings } from '../otp/otp.config';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ForgotPasswordResponseDto, ResetTokenResponseDto } from './dto';
import { LoginThrottleService } from './login-throttle.service';

/**
 * Forgot password, in three steps: prove you own the address (username and email, then the emailed code), then set a new
 * password with a one-time token that only that code could have produced.
 *
 * <ul>
 *   <li><b>No enumeration.</b> Asking for a reset always answers the same way, whether or not the username and email
 *       match an account. A wrong guess gets a challenge id that can never be verified; a right one gets an email.
 *       The email is sent in the background so the answer takes the same time either way.</li>
 *   <li>The code is only ever emailed to the address on the account's own record.</li>
 *   <li>A new password must satisfy the registration rules (the DTO), differ from the username, and differ from the
 *       current password. Refusing one of those does not spend the reset token, so the person can try another.</li>
 *   <li>Changing the password ends every session, and a notice goes to the same address.</li>
 * </ul>
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly throttle: LoginThrottleService,
    private readonly logger: RedactingLogger,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(OTP_SETTINGS) private readonly settings: OtpSettings,
  ) {}

  async request(username: string, email: string, callerId: string): Promise<ForgotPasswordResponseDto> {
    // Asking is rate-limited per caller, whatever the answer would have been.
    const askKey = `forgot:${callerId}`;
    if (this.throttle.isBlocked(askKey)) {
      throw new OtpTooManyRequestsException('Too many requests. Please wait a few minutes and try again', 300);
    }
    this.throttle.recordFailure(askKey);

    const user = await this.usersService.getUserByUsername(username);
    const matches = !!user && user.email.trim().toLowerCase() === email.trim().toLowerCase();

    if (!user || !matches) {
      this.logger.warn('PasswordResetService', 'Password reset asked for details that match no account');
      return this.answer(crypto.randomUUID(), this.settings.resetTtlSeconds);
    }

    const issued = await this.otpService.issue(user.id, 'PASSWORD_RESET');
    this.sendCodeInBackground(user.email, issued);
    return this.answer(issued.challenge.id, issued.expiresInSeconds);
  }

  /**
   * Sends the code again. Anything that is not a plain success (an unknown, used or expired challenge, the cooldown,
   * the limit) answers as if a code had been sent: telling the difference would reveal that the challenge is real.
   */
  async resend(challengeId: string): Promise<ForgotPasswordResponseDto> {
    try {
      const issued = await this.otpService.resend(challengeId, 'PASSWORD_RESET');
      const user = await this.usersService.getUserById(Number(issued.challenge.user_id));
      if (user) {
        this.sendCodeInBackground(user.email, issued);
      }
      return this.answer(challengeId, issued.expiresInSeconds);
    } catch (error) {
      if (error instanceof OtpInvalidException || error instanceof OtpTooManyRequestsException) {
        return this.answer(challengeId, this.settings.resetTtlSeconds);
      }
      throw error;
    }
  }

  async verifyCode(challengeId: string, code: string, callerId: string): Promise<ResetTokenResponseDto> {
    const key = `otp:${callerId}`;
    if (this.throttle.isBlocked(key)) {
      throw new OtpTooManyRequestsException('Too many wrong codes. Please wait a few minutes and try again', 300);
    }

    let challengeUserId: number;
    let id: string;
    try {
      const challenge = await this.otpService.verify(challengeId, 'PASSWORD_RESET', code);
      challengeUserId = Number(challenge.user_id);
      id = challenge.id;
    } catch (error) {
      if (error instanceof OtpInvalidException) {
        this.throttle.recordFailure(key);
      }
      throw error;
    }
    this.throttle.reset(key);

    const { token, expiresInSeconds } = await this.otpService.issueResetToken(id);
    this.logger.log('PasswordResetService', 'Password reset code accepted', { userId: challengeUserId });
    return { resetToken: token, expiresIn: expiresInSeconds };
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    // Look first: a refused password must not use the token up.
    const challenge = await this.otpService.peekResetToken(resetToken);
    const userId = Number(challenge.user_id);
    const user = await this.authService.setNewPassword(userId, newPassword, async () => {
      // Only a password that passed every check spends the token; if another request spent it first, stop here.
      await this.otpService.redeemResetToken(resetToken);
    });
    this.sendNoticeInBackground(user.email);
  }

  private answer(challengeId: string, expiresIn: number): ForgotPasswordResponseDto {
    return { challengeId, expiresIn, resendAfter: this.settings.resendCooldownSeconds };
  }

  private sendCodeInBackground(to: string, issued: IssuedCode): void {
    const message = passwordResetCodeMessage(issued.code, issued.expiresInSeconds);
    this.sendInBackground(to, message.subject, message.body);
  }

  private sendNoticeInBackground(to: string): void {
    const message = passwordChangedMessage();
    this.sendInBackground(to, message.subject, message.body);
  }

  /** Off the request, so a slow or failing mail server changes neither the answer nor how long it takes. */
  private sendInBackground(to: string, subject: string, body: string): void {
    void this.email.send(to, subject, body).catch((error: unknown) => {
      this.logger.warn('PasswordResetService', 'Email could not be sent', {
        reason: error instanceof Error ? error.constructor.name : 'unknown',
      });
    });
  }
}
