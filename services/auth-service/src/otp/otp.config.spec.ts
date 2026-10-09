import { MailSettings } from '../mail/mail.config';
import { assertEmailCanBeSent, otpSecret, otpSettings } from './otp.config';

/** What the file supplies: the limits have no fallback in code. */
const LIMITS = {
  AUTH_OTP_TTL_SECONDS: '300',
  AUTH_OTP_RESET_TTL_SECONDS: '600',
  AUTH_OTP_MAX_ATTEMPTS: '5',
  AUTH_OTP_RESEND_COOLDOWN_SECONDS: '30',
  AUTH_OTP_MAX_SENDS: '3',
};

describe('otp settings', () => {
  it('reads the limits, with two-step sign-in and the registration check on unless switched off', () => {
    expect(otpSettings({ ...LIMITS })).toEqual({
      twoFactorEnabled: true,
      emailVerificationEnabled: true,
      codeTtlSeconds: 300,
      resetTtlSeconds: 600,
      maxAttempts: 5,
      resendCooldownSeconds: 30,
      maxSends: 3,
      codeLength: 6,
    });
  });

  it('turns two-step sign-in (the option) off only with a literal "false"', () => {
    expect(otpSettings({ ...LIMITS, AUTH_TWO_FACTOR_ENABLED: 'false' }).twoFactorEnabled).toBe(false);
    expect(otpSettings({ ...LIMITS, AUTH_TWO_FACTOR_ENABLED: '0' }).twoFactorEnabled).toBe(true);
    expect(otpSettings({ ...LIMITS, AUTH_TWO_FACTOR_ENABLED: '' }).twoFactorEnabled).toBe(true);
  });

  it('turns the email check at registration off only with a literal "false"', () => {
    expect(otpSettings({ ...LIMITS, AUTH_EMAIL_VERIFICATION_ENABLED: 'false' }).emailVerificationEnabled).toBe(false);
    expect(otpSettings({ ...LIMITS, AUTH_EMAIL_VERIFICATION_ENABLED: '0' }).emailVerificationEnabled).toBe(true);
    expect(otpSettings({ ...LIMITS }).emailVerificationEnabled).toBe(true);
  });

  it('reads each limit from its own variable', () => {
    expect(
      otpSettings({
        AUTH_OTP_TTL_SECONDS: '120',
        AUTH_OTP_RESET_TTL_SECONDS: '900',
        AUTH_OTP_MAX_ATTEMPTS: '4',
        AUTH_OTP_RESEND_COOLDOWN_SECONDS: '45',
        AUTH_OTP_MAX_SENDS: '2',
      }),
    ).toMatchObject({ codeTtlSeconds: 120, resetTtlSeconds: 900, maxAttempts: 4, resendCooldownSeconds: 45, maxSends: 2 });
  });

  it('refuses a missing or invalid limit, naming the key to fix', () => {
    expect(() => otpSettings({})).toThrow('fill in auth.otp.ttl-seconds');
    expect(() => otpSettings({ ...LIMITS, AUTH_OTP_TTL_SECONDS: '-5' })).toThrow('auth.otp.ttl-seconds');
    expect(() => otpSettings({ ...LIMITS, AUTH_OTP_MAX_ATTEMPTS: 'many' })).toThrow('auth.otp.max-attempts');
  });

  it('hashes with AUTH_OTP_SECRET when given, else the JWT secret, else nothing', () => {
    expect(otpSecret({ AUTH_OTP_SECRET: 'a', JWT_SECRET: 'b' })).toBe('a');
    expect(otpSecret({ JWT_SECRET: 'b' })).toBe('b');
    expect(otpSecret({})).toBe('');
  });
});

describe('assertEmailCanBeSent', () => {
  const mail = (enabled: boolean): MailSettings => ({
    mode: enabled ? 'dev' : 'off',
    enabled,
    host: 'localhost',
    port: 1025,
    tls: 'none',
    user: null,
    password: null,
    from: 'x@y.z',
    fromDomains: [],
    allowedRecipientDomains: [],
    replyTo: null,
    usedLegacySwitch: false,
  });

  it('refuses to start with the registration email check on and no way to send the code, and says how to fix it', () => {
    expect(() => assertEmailCanBeSent(otpSettings({ ...LIMITS }), mail(false))).toThrow(/AUTH_EMAIL_MODE=dev/);
    expect(() => assertEmailCanBeSent(otpSettings({ ...LIMITS }), mail(false))).toThrow(/AUTH_EMAIL_VERIFICATION_ENABLED=false/);
  });

  it('is fine with email on, or with the check off', () => {
    expect(() => assertEmailCanBeSent(otpSettings({ ...LIMITS }), mail(true))).not.toThrow();
    expect(() =>
      assertEmailCanBeSent(otpSettings({ ...LIMITS, AUTH_EMAIL_VERIFICATION_ENABLED: 'false' }), mail(false)),
    ).not.toThrow();
  });

  it('does not stop the service starting just because two-step sign-in is offered: that is each user\'s choice', () => {
    expect(() =>
      assertEmailCanBeSent(otpSettings({ ...LIMITS, AUTH_EMAIL_VERIFICATION_ENABLED: 'false', AUTH_TWO_FACTOR_ENABLED: 'true' }), mail(false)),
    ).not.toThrow();
  });
});
