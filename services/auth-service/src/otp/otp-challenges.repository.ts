import { Injectable } from '@nestjs/common';
import { DataSource, LessThan, Repository } from 'typeorm';
import { OtpChallenge } from './otp-challenge.entity';

/**
 * Storage for challenges. Every state change that must happen exactly once (a guess counted, a code accepted, a reset
 * token spent) is one conditional UPDATE, so two requests racing cannot both win.
 */
@Injectable()
export class OtpChallengesRepository {
  private readonly repository: Repository<OtpChallenge>;

  constructor(private readonly dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(OtpChallenge);
  }

  create(challenge: Partial<OtpChallenge>): Promise<OtpChallenge> {
    return this.repository.save(this.repository.create(challenge));
  }

  findById(id: string): Promise<OtpChallenge | null> {
    // A malformed id can never match; Postgres would reject it as a uuid, so say "not found" without asking.
    return UUID.test(id) ? this.repository.findOne({ where: { id } }) : Promise.resolve(null);
  }

  findByResetTokenHash(hash: string): Promise<OtpChallenge | null> {
    return this.repository.findOne({ where: { reset_token_hash: hash } });
  }

  /**
   * Counts one guess against a live code and returns the challenge as it stands, or null when there is nothing to
   * guess against (unknown, used, expired, wrong purpose, or already at the limit). Atomic: parallel guesses cannot
   * exceed `maxAttempts`.
   */
  async countAttempt(id: string, purpose: string, maxAttempts: number, now: Date): Promise<OtpChallenge | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND purpose = :purpose AND consumed_at IS NULL AND expires_at > :now AND attempts < :max', {
        id,
        purpose,
        now,
        max: maxAttempts,
      })
      .returning('*')
      .execute();
    const rows = result.raw as OtpChallenge[];
    return rows.length > 0 ? this.repository.create(rows[0]) : null;
  }

  /** Marks the challenge used. True only for the one caller that got there first. */
  async consume(id: string, now: Date): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({ consumed_at: now })
      .where('id = :id AND consumed_at IS NULL', { id })
      .execute();
    return (result.affected ?? 0) === 1;
  }

  /** Gives up on a challenge (too many wrong guesses), so its code cannot be tried again. */
  async invalidate(id: string, now: Date): Promise<void> {
    await this.consume(id, now);
  }

  /** Forgets the typed details once they have been turned into a user (or given up on): no password hash lingers. */
  async clearPending(id: string): Promise<void> {
    await this.repository.update(
      { id },
      { pending_username: null, pending_email: null, pending_password_hash: null },
    );
  }

  /** Replaces the code with a fresh one for the same challenge. False when the challenge is not live any more. */
  async replaceCode(
    id: string,
    purpose: string,
    codeHash: string,
    expiresAt: Date,
    now: Date,
    maxSends: number,
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({
        code_hash: codeHash,
        attempts: 0,
        sends: () => 'sends + 1',
        last_sent_at: now,
        expires_at: expiresAt,
      })
      .where('id = :id AND purpose = :purpose AND consumed_at IS NULL AND expires_at > :now AND sends < :maxSends', {
        id,
        purpose,
        now,
        maxSends,
      })
      .execute();
    return (result.affected ?? 0) === 1;
  }

  /** Attaches the one-time reset token to a challenge whose code was accepted. */
  async setResetToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.repository.update({ id }, { reset_token_hash: tokenHash, reset_expires_at: expiresAt });
  }

  /** Spends the reset token. Returns the challenge only for the one caller that got there first, while it is valid. */
  async redeemResetToken(tokenHash: string, now: Date): Promise<OtpChallenge | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({ reset_used_at: now })
      .where('reset_token_hash = :tokenHash AND reset_used_at IS NULL AND reset_expires_at > :now', {
        tokenHash,
        now,
      })
      .returning('*')
      .execute();
    const rows = result.raw as OtpChallenge[];
    return rows.length > 0 ? this.repository.create(rows[0]) : null;
  }

  /** Housekeeping: drops challenges that expired more than a day ago. */
  async deleteExpired(before: Date): Promise<void> {
    await this.repository.delete({ expires_at: LessThan(before) });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
