import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../users/user.entity';

export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET' | 'REGISTRATION';

/**
 * One one-time-code challenge: the second step of a sign-in, the first two steps of a password reset, or the email check of a
 * registration (which has no user yet: `user_id` is null and the details wait in the `pending_*` columns until the code is right).
 *
 * The code itself is never stored, only an HMAC of it (`code_hash`), so a copy of this table does not reveal a usable
 * code. For a password reset, once the code is accepted the challenge also holds the hash of a one-time reset token and
 * its expiry, so changing the password needs both the email and this server's say-so.
 */
@Entity('otp_challenges')
@Index('idx_otp_challenges_user_id', ['user_id'])
@Index('idx_otp_challenges_expires_at', ['expires_at'])
export class OtpChallenge {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('bigint', { name: 'user_id', nullable: true })
  user_id!: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column('varchar', { length: 14 })
  purpose!: OtpPurpose;

  /** HMAC-SHA256 (hex) of the challenge id and the code. */
  @Column('varchar', { length: 64 })
  code_hash!: string;

  /** Guesses made against the current code. */
  @Column('int', { default: 0 })
  attempts!: number;

  /** Emails sent for this challenge, the first included. */
  @Column('int', { default: 1 })
  sends!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column('timestamptz', { default: () => 'CURRENT_TIMESTAMP' })
  last_sent_at!: Date;

  @Column('timestamptz')
  expires_at!: Date;

  /** Set when the code was accepted, or the challenge was given up on. A challenge is used once. */
  @Column('timestamptz', { nullable: true })
  consumed_at!: Date | null;

  /** Registration only: what the person typed, held until their email is verified. The password is already hashed. */
  @Column('varchar', { length: 64, nullable: true })
  pending_username!: string | null;

  @Column('varchar', { length: 255, nullable: true })
  pending_email!: string | null;

  @Column('varchar', { length: 255, nullable: true })
  pending_password_hash!: string | null;

  /** Password reset only: SHA-256 (hex) of the one-time reset token. */
  @Column('varchar', { length: 64, nullable: true, unique: true })
  reset_token_hash!: string | null;

  @Column('timestamptz', { nullable: true })
  reset_expires_at!: Date | null;

  @Column('timestamptz', { nullable: true })
  reset_used_at!: Date | null;
}
