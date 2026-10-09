import { Inject, Injectable, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { OtpInvalidException, OtpTooManyRequestsException } from '../common/exceptions';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { OtpChallenge, OtpPurpose } from './otp-challenge.entity';
import { OtpChallengesRepository } from './otp-challenges.repository';
import { OTP_CLOCK, OTP_SETTINGS, OtpSettings, otpSecret } from './otp.config';

/** What `issue` and `resend` hand back: the challenge to answer, and the code to put in the email (never stored). */
export interface IssuedCode {
  readonly challenge: OtpChallenge;
  readonly code: string;
  readonly expiresInSeconds: number;
}

/**
 * Creates, checks and spends one-time codes. It knows nothing about email or sign-in: callers send the code and decide
 * what a correct one unlocks.
 *
 * <ul>
 *   <li>The code is random (`crypto.randomInt`), six digits, and only an HMAC of it is stored.</li>
 *   <li>Every guess is counted before it is checked, atomically, and a code dies after `maxAttempts` wrong ones.</li>
 *   <li>A correct code is accepted once; so is a reset token.</li>
 *   <li>Whatever is wrong with a code (unknown, wrong, expired, used, too many guesses) is the same answer,
 *       `OTP-401`, so a caller cannot tell which, or whether a challenge exists at all.</li>
 * </ul>
 */
@Injectable()
export class OtpService {
  private readonly now: () => Date;

  constructor(
    private readonly challenges: OtpChallengesRepository,
    private readonly logger: RedactingLogger,
    @Inject(OTP_SETTINGS) private readonly settings: OtpSettings,
    @Optional() @Inject(OTP_CLOCK) clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  /**
   * Starts a challenge and returns the code to send. A sign-in or reset belongs to a user; a registration has no user yet
   * and carries what the person typed (`pending`, the password already hashed) until the code is right.
   */
  async issue(
    userId: number | null,
    purpose: OtpPurpose,
    pending?: { username: string; email: string; passwordHash: string },
  ): Promise<IssuedCode> {
    const id = crypto.randomUUID();
    const code = this.generateCode();
    const now = this.now();
    const ttl = this.ttlSeconds(purpose);
    const challenge = await this.challenges.create({
      id,
      user_id: userId,
      purpose,
      code_hash: this.hash(id, code),
      attempts: 0,
      sends: 1,
      last_sent_at: now,
      expires_at: new Date(now.getTime() + ttl * 1000),
      consumed_at: null,
      pending_username: pending?.username ?? null,
      pending_email: pending?.email ?? null,
      pending_password_hash: pending?.passwordHash ?? null,
      reset_token_hash: null,
      reset_expires_at: null,
      reset_used_at: null,
    });
    this.logger.log('OtpService', 'One-time code issued', { challengeId: id, purpose });
    return { challenge, code, expiresInSeconds: ttl };
  }

  /**
   * Replaces the code of a live challenge with a new one, to be emailed again. At most `maxSends` emails per challenge
   * and `resendCooldownSeconds` between them; asking sooner is `OTP-429` with how long to wait.
   */
  async resend(challengeId: string, purpose: OtpPurpose): Promise<IssuedCode> {
    const now = this.now();
    const current = await this.challenges.findById(challengeId);
    if (!current || current.purpose !== purpose || current.consumed_at || current.expires_at <= now) {
      throw new OtpInvalidException();
    }
    if (current.sends >= this.settings.maxSends) {
      throw new OtpTooManyRequestsException('No more codes can be sent for this attempt. Please start again', 0);
    }
    const waited = Math.floor((now.getTime() - current.last_sent_at.getTime()) / 1000);
    if (waited < this.settings.resendCooldownSeconds) {
      const wait = this.settings.resendCooldownSeconds - waited;
      throw new OtpTooManyRequestsException(`Please wait ${wait} seconds before asking for another code`, wait);
    }

    const code = this.generateCode();
    const ttl = this.ttlSeconds(purpose);
    const replaced = await this.challenges.replaceCode(
      challengeId,
      purpose,
      this.hash(challengeId, code),
      new Date(now.getTime() + ttl * 1000),
      now,
      this.settings.maxSends,
    );
    if (!replaced) {
      // Another request got in first (used, expired or sent meanwhile).
      throw new OtpInvalidException();
    }
    const challenge = await this.challenges.findById(challengeId);
    if (!challenge) {
      throw new OtpInvalidException();
    }
    this.logger.log('OtpService', 'One-time code sent again', { challengeId, purpose, sends: challenge.sends });
    return { challenge, code, expiresInSeconds: ttl };
  }

  /**
   * Checks a code and, when right, accepts it (once). Returns the challenge so the caller knows whose it is. Throws
   * `OTP-401` for any failure.
   */
  async verify(challengeId: string, purpose: OtpPurpose, code: string): Promise<OtpChallenge> {
    const now = this.now();
    const attempt = await this.challenges.countAttempt(challengeId, purpose, this.settings.maxAttempts, now);
    if (!attempt) {
      throw new OtpInvalidException();
    }

    if (!this.matches(attempt, code)) {
      if (attempt.attempts >= this.settings.maxAttempts) {
        await this.challenges.invalidate(challengeId, now);
        this.logger.warn('OtpService', 'One-time code given up on after too many wrong guesses', {
          challengeId,
          purpose,
        });
      }
      throw new OtpInvalidException();
    }

    if (!(await this.challenges.consume(challengeId, now))) {
      // A parallel request spent it first.
      throw new OtpInvalidException();
    }
    return attempt;
  }

  /** After a password-reset code is accepted: a one-time token that authorises setting the new password. */
  async issueResetToken(challengeId: string): Promise<{ token: string; expiresInSeconds: number }> {
    const token = crypto.randomBytes(32).toString('hex');
    const ttl = this.settings.resetTtlSeconds;
    await this.challenges.setResetToken(
      challengeId,
      this.sha256(token),
      new Date(this.now().getTime() + ttl * 1000),
    );
    return { token, expiresInSeconds: ttl };
  }

  /**
   * Looks at a reset token without spending it: whose password it is for, or `OTP-401`. Lets the caller refuse a bad
   * new password (the same as the old one) without burning the token, so the person can simply try another.
   */
  async peekResetToken(token: string): Promise<OtpChallenge> {
    const found = await this.challenges.findByResetTokenHash(this.sha256(token));
    const now = this.now();
    if (!found || found.reset_used_at || !found.reset_expires_at || found.reset_expires_at <= now) {
      throw new OtpInvalidException('This reset has expired. Please start again');
    }
    return found;
  }

  /** Spends a reset token. Returns the challenge (so: whose password) or throws `OTP-401`. Works once. */
  async redeemResetToken(token: string): Promise<OtpChallenge> {
    const redeemed = await this.challenges.redeemResetToken(this.sha256(token), this.now());
    if (!redeemed) {
      throw new OtpInvalidException('This reset has expired. Please start again');
    }
    return redeemed;
  }

  private ttlSeconds(purpose: OtpPurpose): number {
    return purpose === 'PASSWORD_RESET' ? this.settings.resetTtlSeconds : this.settings.codeTtlSeconds;
  }

  private generateCode(): string {
    const max = 10 ** this.settings.codeLength;
    return crypto.randomInt(0, max).toString().padStart(this.settings.codeLength, '0');
  }

  private matches(challenge: OtpChallenge, code: string): boolean {
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const actual = Buffer.from(this.hash(challenge.id, code), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  private hash(challengeId: string, code: string): string {
    return crypto.createHmac('sha256', otpSecret()).update(`${challengeId}:${code}`).digest('hex');
  }

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
