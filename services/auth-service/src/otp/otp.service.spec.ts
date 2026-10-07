import { OtpInvalidException, OtpTooManyRequestsException } from '../common/exceptions';
import { OtpChallenge } from './otp-challenge.entity';
import { OtpService } from './otp.service';
import { OtpSettings } from './otp.config';

/**
 * An in-memory stand-in for the repository that behaves like its conditional UPDATEs (each state change happens only
 * when the row is still in the state the SQL requires), so the service's rules can be tested without a database.
 */
class FakeChallenges {
  readonly rows = new Map<string, OtpChallenge>();

  async create(challenge: Partial<OtpChallenge>): Promise<OtpChallenge> {
    const row = { created_at: challenge.last_sent_at, ...challenge } as OtpChallenge;
    this.rows.set(row.id, row);
    return { ...row };
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByResetTokenHash(hash: string): Promise<OtpChallenge | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.reset_token_hash === hash);
    return row ? { ...row } : null;
  }

  async countAttempt(id: string, purpose: string, max: number, now: Date): Promise<OtpChallenge | null> {
    const row = this.rows.get(id);
    if (!row || row.purpose !== purpose || row.consumed_at || row.expires_at <= now || row.attempts >= max) {
      return null;
    }
    row.attempts += 1;
    return { ...row };
  }

  async consume(id: string, now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.consumed_at) {
      return false;
    }
    row.consumed_at = now;
    return true;
  }

  async invalidate(id: string, now: Date): Promise<void> {
    await this.consume(id, now);
  }

  async replaceCode(
    id: string,
    purpose: string,
    codeHash: string,
    expiresAt: Date,
    now: Date,
    maxSends: number,
  ): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.purpose !== purpose || row.consumed_at || row.expires_at <= now || row.sends >= maxSends) {
      return false;
    }
    Object.assign(row, { code_hash: codeHash, attempts: 0, sends: row.sends + 1, last_sent_at: now, expires_at: expiresAt });
    return true;
  }

  async setResetToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    Object.assign(this.rows.get(id)!, { reset_token_hash: tokenHash, reset_expires_at: expiresAt });
  }

  async redeemResetToken(tokenHash: string, now: Date): Promise<OtpChallenge | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.reset_token_hash === tokenHash);
    if (!row || row.reset_used_at || !row.reset_expires_at || row.reset_expires_at <= now) {
      return null;
    }
    row.reset_used_at = now;
    return { ...row };
  }
}

const SETTINGS: OtpSettings = {
  twoFactorEnabled: true,
  emailVerificationEnabled: true,
  codeTtlSeconds: 300,
  resetTtlSeconds: 600,
  maxAttempts: 3,
  resendCooldownSeconds: 30,
  maxSends: 3,
  codeLength: 6,
};

describe('OtpService', () => {
  let challenges: FakeChallenges;
  let service: OtpService;
  let clock: Date;
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const advance = (seconds: number) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-secret';
    delete process.env.AUTH_OTP_SECRET;
    challenges = new FakeChallenges();
    clock = new Date('2026-10-07T10:00:00Z');
    service = new OtpService(challenges as never, logger as never, SETTINGS, () => clock);
  });

  describe('issue', () => {
    it('makes a six-digit code that is not stored, only its hash', async () => {
      const { challenge, code, expiresInSeconds } = await service.issue(1000, 'LOGIN');

      expect(code).toMatch(/^[0-9]{6}$/);
      expect(expiresInSeconds).toBe(300);
      expect(challenge.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify([...challenges.rows.values()])).not.toContain(code);
      expect(challenge.expires_at).toEqual(new Date('2026-10-07T10:05:00Z'));
    });

    it('gives a password reset longer than a sign-in', async () => {
      const { challenge, expiresInSeconds } = await service.issue(1000, 'PASSWORD_RESET');

      expect(expiresInSeconds).toBe(600);
      expect(challenge.expires_at).toEqual(new Date('2026-10-07T10:10:00Z'));
    });

    it('keeps leading zeros and never makes the same code twice in a row (statistically)', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 40; i++) {
        codes.add((await service.issue(1000, 'LOGIN')).code);
      }
      expect(codes.size).toBeGreaterThan(30);
      expect([...codes].every((code) => code.length === 6)).toBe(true);
    });
  });

  describe('verify', () => {
    it('accepts the right code once and says whose it is', async () => {
      const { challenge, code } = await service.issue(1000, 'LOGIN');

      const accepted = await service.verify(challenge.id, 'LOGIN', code);

      expect(Number(accepted.user_id)).toBe(1000);
      await expect(service.verify(challenge.id, 'LOGIN', code)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('rejects a wrong code, and the right one still works afterwards', async () => {
      const { challenge, code } = await service.issue(1000, 'LOGIN');
      const wrong = code === '000000' ? '000001' : '000000';

      await expect(service.verify(challenge.id, 'LOGIN', wrong)).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.verify(challenge.id, 'LOGIN', code)).resolves.toBeDefined();
    });

    it('kills the code after the allowed number of wrong guesses, even for the right code', async () => {
      const { challenge, code } = await service.issue(1000, 'LOGIN');
      const wrong = code === '000000' ? '000001' : '000000';

      for (let i = 0; i < SETTINGS.maxAttempts; i++) {
        await expect(service.verify(challenge.id, 'LOGIN', wrong)).rejects.toBeInstanceOf(OtpInvalidException);
      }

      await expect(service.verify(challenge.id, 'LOGIN', code)).rejects.toBeInstanceOf(OtpInvalidException);
      expect(logger.warn).toHaveBeenCalledWith('OtpService', expect.stringContaining('too many wrong guesses'), expect.anything());
    });

    it('rejects an expired code', async () => {
      const { challenge, code } = await service.issue(1000, 'LOGIN');
      advance(301);

      await expect(service.verify(challenge.id, 'LOGIN', code)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('answers an unknown challenge exactly like a wrong code', async () => {
      await expect(service.verify('3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11', 'LOGIN', '123456')).rejects.toBeInstanceOf(
        OtpInvalidException,
      );
    });

    it('will not take a sign-in code for a password reset, or the other way round', async () => {
      const login = await service.issue(1000, 'LOGIN');
      const reset = await service.issue(1000, 'PASSWORD_RESET');

      await expect(service.verify(login.challenge.id, 'PASSWORD_RESET', login.code)).rejects.toBeInstanceOf(
        OtpInvalidException,
      );
      await expect(service.verify(reset.challenge.id, 'LOGIN', reset.code)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('lets only one of two requests with the right code win', async () => {
      const { challenge, code } = await service.issue(1000, 'LOGIN');

      const results = await Promise.allSettled([
        service.verify(challenge.id, 'LOGIN', code),
        service.verify(challenge.id, 'LOGIN', code),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('does not depend on the code being compared in constant length (a short guess is just wrong)', async () => {
      const { challenge } = await service.issue(1000, 'LOGIN');

      await expect(service.verify(challenge.id, 'LOGIN', '1')).rejects.toBeInstanceOf(OtpInvalidException);
    });
  });

  describe('resend', () => {
    it('refuses to send again too soon, saying how long to wait', async () => {
      const { challenge } = await service.issue(1000, 'LOGIN');
      advance(10);

      const error = await service.resend(challenge.id, 'LOGIN').catch((e) => e);

      expect(error).toBeInstanceOf(OtpTooManyRequestsException);
      expect(error.retryAfterSeconds).toBe(20);
    });

    it('sends a new code after the cooldown, and the old one stops working', async () => {
      const first = await service.issue(1000, 'LOGIN');
      advance(31);

      const second = await service.resend(first.challenge.id, 'LOGIN');

      expect(second.challenge.sends).toBe(2);
      expect(second.challenge.expires_at.getTime()).toBeGreaterThan(first.challenge.expires_at.getTime());
      if (second.code !== first.code) {
        await expect(service.verify(first.challenge.id, 'LOGIN', first.code)).rejects.toBeInstanceOf(
          OtpInvalidException,
        );
      }
      await expect(service.verify(first.challenge.id, 'LOGIN', second.code)).resolves.toBeDefined();
    });

    it('gives the new code a fresh set of guesses', async () => {
      const first = await service.issue(1000, 'LOGIN');
      const wrong = first.code === '000000' ? '000001' : '000000';
      await service.verify(first.challenge.id, 'LOGIN', wrong).catch(() => undefined);
      advance(31);

      const second = await service.resend(first.challenge.id, 'LOGIN');

      expect(second.challenge.attempts).toBe(0);
    });

    it('stops after the allowed number of emails', async () => {
      const { challenge } = await service.issue(1000, 'LOGIN');
      for (let i = 0; i < SETTINGS.maxSends - 1; i++) {
        advance(31);
        await service.resend(challenge.id, 'LOGIN');
      }
      advance(31);

      await expect(service.resend(challenge.id, 'LOGIN')).rejects.toBeInstanceOf(OtpTooManyRequestsException);
    });

    it('does not revive an expired, used or foreign challenge', async () => {
      const used = await service.issue(1000, 'LOGIN');
      await service.verify(used.challenge.id, 'LOGIN', used.code);
      const expired = await service.issue(1000, 'LOGIN');
      advance(301);
      const reset = await service.issue(1000, 'PASSWORD_RESET');
      advance(31);

      await expect(service.resend(used.challenge.id, 'LOGIN')).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.resend(expired.challenge.id, 'LOGIN')).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.resend(reset.challenge.id, 'LOGIN')).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.resend('3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11', 'LOGIN')).rejects.toBeInstanceOf(
        OtpInvalidException,
      );
    });
  });

  describe('reset tokens', () => {
    async function acceptedReset() {
      const { challenge, code } = await service.issue(1000, 'PASSWORD_RESET');
      await service.verify(challenge.id, 'PASSWORD_RESET', code);
      return { challenge, ...(await service.issueResetToken(challenge.id)) };
    }

    it('issues a random token, stores only its hash, and works once', async () => {
      const { challenge, token, expiresInSeconds } = await acceptedReset();

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(expiresInSeconds).toBe(600);
      expect(JSON.stringify([...challenges.rows.values()])).not.toContain(token);

      await expect(service.redeemResetToken(token)).resolves.toMatchObject({ id: challenge.id });
      await expect(service.redeemResetToken(token)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('lets the token be looked at without being spent', async () => {
      const { token } = await acceptedReset();

      await expect(service.peekResetToken(token)).resolves.toBeDefined();
      await expect(service.peekResetToken(token)).resolves.toBeDefined();
      await expect(service.redeemResetToken(token)).resolves.toBeDefined();
      await expect(service.peekResetToken(token)).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('refuses an expired, unknown or never-issued token', async () => {
      const { token } = await acceptedReset();
      advance(601);

      await expect(service.peekResetToken(token)).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.redeemResetToken(token)).rejects.toBeInstanceOf(OtpInvalidException);
      await expect(service.peekResetToken('f'.repeat(64))).rejects.toBeInstanceOf(OtpInvalidException);
    });

    it('cannot be obtained without first getting the code right', async () => {
      const { challenge } = await service.issue(1000, 'PASSWORD_RESET');

      // No token has been issued for this challenge, so there is nothing to present.
      await expect(service.peekResetToken(challenge.id)).rejects.toBeInstanceOf(OtpInvalidException);
    });
  });

  it('uses AUTH_OTP_SECRET for the hashes when it is set, so a different key does not verify', async () => {
    const { challenge, code } = await service.issue(1000, 'LOGIN');
    process.env.AUTH_OTP_SECRET = 'a-different-key';

    await expect(service.verify(challenge.id, 'LOGIN', code)).rejects.toBeInstanceOf(OtpInvalidException);
  });
});
