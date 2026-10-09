import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  OtpDeliveryFailedException,
  PasswordIncorrectException,
  PasswordLockedException,
  PasswordReuseException,
  UnauthorisedException,
} from '../common/exceptions';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { CredentialsService } from '../credentials/credentials.service';
import { EMAIL_SENDER, EmailSender } from '../mail/email-sender';
import { passwordChangedMessage } from '../mail/otp-messages';
import { OTP_SETTINGS, OtpSettings } from '../otp/otp.config';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokenResponseDto, UserResponseDto } from './dto';
import { MAX_PASSWORD_CHANGE_ATTEMPTS, PasswordAttemptsService } from './password-attempts.service';

/**
 * What a signed-in user can do to their own sign-in: switch two-step sign-in on or off, and change their password.
 *
 * <b>Changing the password</b> asks for the current one together with the new one:
 * <ul>
 *   <li>A wrong current password is `PWD-403` with how many tries are left. The THIRD wrong one ends the session it was typed
 *       in (its refresh token is revoked and the caller clears the cookies) and answers `PWD-423`. The count is per session
 *       and stays put once reached, so the access token the ended session still holds cannot go on guessing.</li>
 *   <li>A right one then has the new password checked the same way a reset does: registration rules (the DTO), different from
 *       the username, different from the current password (`PWD-422`).</li>
 *   <li>On success every session is ended, a fresh pair is issued so the user stays signed in HERE, and a notice is emailed.</li>
 * </ul>
 */
@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly credentialsService: CredentialsService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly attempts: PasswordAttemptsService,
    private readonly logger: RedactingLogger,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(OTP_SETTINGS) private readonly settings: OtpSettings,
  ) {}

  /**
   * Switches two-step sign-in for the user. Switching it ON needs somewhere to send the code, so it is refused (`OTP-503`)
   * when two-step sign-in is not offered here or email is not available: otherwise the user would lock themselves out.
   */
  async setTwoFactor(userId: number, enabled: boolean): Promise<UserResponseDto> {
    if (enabled && (!this.settings.twoFactorEnabled || !this.email.enabled())) {
      throw new OtpDeliveryFailedException(
        'Two-step sign-in is not available here, because no code could be emailed to you',
      );
    }
    const user = await this.usersService.getUserById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }
    await this.usersService.setTwoFactorEnabled(userId, enabled);
    this.logger.log('AccountSecurityService', 'Two-step sign-in changed', { userId, enabled });
    return this.authService.toUserResponse({ ...user, two_factor_enabled: enabled });
  }

  /**
   * @param refreshToken the session's refresh token when the request carried one (the browser's cookie); it identifies the
   *        session for counting wrong passwords and is what is revoked when the tries run out.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    refreshToken?: string,
  ): Promise<TokenResponseDto> {
    const user = await this.usersService.getUserById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }

    const key = this.sessionKey(userId, refreshToken);
    if (this.attempts.remaining(key) === 0) {
      await this.endSession(refreshToken);
      throw new PasswordLockedException();
    }

    if (!(await this.credentialsService.verifyPassword(currentPassword, user.password_hash))) {
      const left = this.attempts.recordFailure(key);
      this.logger.warn('AccountSecurityService', 'Wrong current password while changing it', { userId, attemptsLeft: left });
      if (left === 0) {
        await this.endSession(refreshToken);
        throw new PasswordLockedException();
      }
      throw new PasswordIncorrectException(left);
    }

    if (newPassword === currentPassword) {
      // The same as the current one, caught before anything is hashed. It is not a wrong guess: the password was right.
      throw new PasswordReuseException();
    }

    await this.authService.setNewPassword(userId, newPassword);
    this.attempts.reset(key);
    this.sendNoticeInBackground(user.email);
    return this.authService.issueTokens(user);
  }

  /** How many wrong current passwords this session may still type (for tests and the controller's answer). */
  attemptsLeft(userId: number, refreshToken?: string): number {
    return this.attempts.remaining(this.sessionKey(userId, refreshToken));
  }

  private async endSession(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.refreshTokensService.revokeRefreshToken(refreshToken);
    }
  }

  private sessionKey(userId: number, refreshToken: string | undefined): string {
    return refreshToken
      ? `session:${crypto.createHash('sha256').update(refreshToken).digest('hex')}`
      : `user:${userId}`;
  }

  /** Off the request, so a slow or failing mail server changes neither the answer nor how long it takes. */
  private sendNoticeInBackground(to: string): void {
    if (!this.email.enabled()) {
      return;
    }
    const message = passwordChangedMessage();
    void this.email.send(to, message.subject, message.body).catch((error: unknown) => {
      this.logger.warn('AccountSecurityService', 'Password-changed notice could not be sent', {
        reason: error instanceof Error ? error.constructor.name : 'unknown',
      });
    });
  }
}

export { MAX_PASSWORD_CHANGE_ATTEMPTS };
