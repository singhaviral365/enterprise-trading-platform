import { OTP_SCHEMA_STATEMENTS, OtpSchemaService } from './otp-schema.service';

describe('OtpSchemaService', () => {
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('creates the table and its indexes, in order, whatever NODE_ENV is', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await new OtpSchemaService(dataSource as never, logger as never).onModuleInit();

    process.env.NODE_ENV = previous;
    expect(dataSource.query.mock.calls.map((call) => call[0])).toEqual([...OTP_SCHEMA_STATEMENTS]);
    expect(OTP_SCHEMA_STATEMENTS[0]).toContain('CREATE TABLE IF NOT EXISTS otp_challenges');
    // every statement can run again: it creates only what is missing, or sets something to what it already is
    const idempotent = /IF NOT EXISTS|DROP CONSTRAINT IF EXISTS|DROP NOT NULL|SET DEFAULT|ADD CONSTRAINT chk_otp_challenges_purpose/;
    expect(OTP_SCHEMA_STATEMENTS.every((statement) => idempotent.test(statement))).toBe(true);
    // the later versions of the table, and the per-user two-step switch
    const all = OTP_SCHEMA_STATEMENTS.join('\n');
    expect(all).toContain('ALTER COLUMN user_id DROP NOT NULL');
    expect(all).toContain('pending_password_hash');
    expect(all).toContain("'REGISTRATION'");
    expect(all).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE');
    expect(all).toContain('ALTER COLUMN two_factor_enabled SET DEFAULT TRUE');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('says how to fix it, and lets the service start, when the table cannot be created', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('permission denied for schema public')) };

    await expect(new OtpSchemaService(dataSource as never, logger as never).onModuleInit()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'OtpSchemaService',
      expect.stringContaining('add_auth_otp_challenges.sql'),
      { error: 'permission denied for schema public' },
    );
  });
});
