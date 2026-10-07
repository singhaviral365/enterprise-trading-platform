import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedactingLogger } from '../common/logging/redacting.logger';

/**
 * The statements that create `otp_challenges`. Every one is idempotent, so running them on each start-up is harmless, and
 * they are the same as `databases/PostgreSQL/migrations/add_auth_otp_challenges.sql`.
 */
export const OTP_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS otp_challenges (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
     purpose VARCHAR(14) NOT NULL,
     code_hash VARCHAR(64) NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     sends INTEGER NOT NULL DEFAULT 1,
     created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
     last_sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
     expires_at TIMESTAMPTZ NOT NULL,
     consumed_at TIMESTAMPTZ,
     reset_token_hash VARCHAR(64) UNIQUE,
     reset_expires_at TIMESTAMPTZ,
     reset_used_at TIMESTAMPTZ,
     CONSTRAINT chk_otp_challenges_purpose CHECK (purpose IN ('LOGIN', 'PASSWORD_RESET')),
     CONSTRAINT chk_otp_challenges_attempts CHECK (attempts >= 0),
     CONSTRAINT chk_otp_challenges_sends CHECK (sends >= 1)
   )`,
  'CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_id ON otp_challenges(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at ON otp_challenges(expires_at)',

  // A registration has no user until its email is verified, so the user is optional and the typed details wait here.
  'ALTER TABLE otp_challenges ALTER COLUMN user_id DROP NOT NULL',
  'ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_username VARCHAR(64)',
  'ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255)',
  'ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255)',
  'ALTER TABLE otp_challenges DROP CONSTRAINT IF EXISTS chk_otp_challenges_purpose',
  `ALTER TABLE otp_challenges ADD CONSTRAINT chk_otp_challenges_purpose
     CHECK (purpose IN ('LOGIN', 'PASSWORD_RESET', 'REGISTRATION'))`,

  // Two-step sign-in is each user's own choice, off until they switch it on.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE',
];

/**
 * Makes sure the one-time-code table (and the per-user two-step switch on `users`) exist whenever the service starts, in any
 * environment.
 *
 * TypeORM's `synchronize` creates tables only when `NODE_ENV=development`, and a database that was set up from an SQL script
 * (or by an earlier version of this service) has no `otp_challenges`. Without it every sign-in fails after the password is
 * checked. The service therefore creates its own table, as the Trade API does for its tables, instead of depending on how
 * the database was prepared. The table needs `users` to exist already; if it does not, that is said clearly and start-up
 * carries on (sign-in cannot work without users anyway).
 */
@Injectable()
export class OtpSchemaService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: RedactingLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      for (const statement of OTP_SCHEMA_STATEMENTS) {
        await this.dataSource.query(statement);
      }
      this.logger.log('OtpSchemaService', 'The otp_challenges table is in place');
    } catch (error) {
      this.logger.error(
        'OtpSchemaService',
        'Could not create or update the otp_challenges table or users.two_factor_enabled. Email verification, two-step sign-in and forgot password will fail until they exist: ' +
          'run databases/PostgreSQL/migrations/add_auth_otp_challenges.sql against the auth database, ' +
          'or give the database user permission to create tables.',
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }
}
