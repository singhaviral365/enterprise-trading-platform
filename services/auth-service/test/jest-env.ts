// Unit tests run without config/application.yml, so the settings the service insists on get fixed test values here.
// A value already in the environment wins, and a spec can still pass its own env object to the function it tests.
const fixtures: Record<string, string> = {
  JWT_SECRET: 'unit-test-secret-unit-test-secret-1234',
  JWT_ISSUER: 'auth-service',
  JWT_ACCESS_TOKEN_EXPIRES_IN: '900',
  JWT_REFRESH_TOKEN_EXPIRES_IN: '604800',
  DATABASE_PORT: '5432',
  PORT: '3000',
  LOG_LEVEL: 'debug',
  AUTH_COOKIE_SAMESITE: 'strict',
  AUTH_OTP_TTL_SECONDS: '300',
  AUTH_OTP_RESET_TTL_SECONDS: '600',
  AUTH_OTP_MAX_ATTEMPTS: '5',
  AUTH_OTP_RESEND_COOLDOWN_SECONDS: '30',
  AUTH_OTP_MAX_SENDS: '3',
  MAILHOG_HOST: 'localhost',
  MAILHOG_SMTP_PORT: '1025',
};
for (const [name, value] of Object.entries(fixtures)) {
  process.env[name] ??= value;
}
