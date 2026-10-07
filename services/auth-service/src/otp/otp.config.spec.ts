import { assertEmailCanBeSent, otpSecret, otpSettings } from './otp.config';

describe('otp settings', () => {
  it('has safe defaults, with two-step sign-in on', () => {
    expect(otpSettings({})).toEqual({
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
    expect(otpSettings({ AUTH_TWO_FACTOR_ENABLED: 'false' }).twoFactorEnabled).toBe(false);
    expect(otpSettings({ AUTH_TWO_FACTOR_ENABLED: '0' }).twoFactorEnabled).toBe(true);
    expect(otpSettings({ AUTH_TWO_FACTOR_ENABLED: '' }).twoFactorEnabled).toBe(true);
  });

  it('turns the email check at registration off only with a literal "false"', () => {
    expect(otpSettings({ AUTH_EMAIL_VERIFICATION_ENABLED: 'false' }).emailVerificationEnabled).toBe(false);
    expect(otpSettings({ AUTH_EMAIL_VERIFICATION_ENABLED: '0' }).emailVerificationEnabled).toBe(true);
    expect(otpSettings({}).emailVerificationEnabled).toBe(true);
  });

  it('reads the limits, ignoring anything that is not a positive number', () => {
    expect(
      otpSettings({
        AUTH_OTP_TTL_SECONDS: '120',
        AUTH_OTP_RESET_TTL_SECONDS: '900',
        AUTH_OTP_MAX_ATTEMPTS: '4',
        AUTH_OTP_RESEND_COOLDOWN_SECONDS: '45',
        AUTH_OTP_MAX_SENDS: '2',
      }),
    ).toMatchObject({ codeTtlSeconds: 120, resetTtlSeconds: 900, maxAttempts: 4, resendCooldownSeconds: 45, maxSends: 2 });
    expect(otpSettings({ AUTH_OTP_TTL_SECONDS: '-5', AUTH_OTP_MAX_ATTEMPTS: 'many' })).toMatchObject({
      codeTtlSeconds: 300,
      maxAttempts: 5,
    });
  });

  it('hashes with AUTH_OTP_SECRET when given, else the JWT secret, else nothing', () => {
    expect(otpSecret({ AUTH_OTP_SECRET: 'a', JWT_SECRET: 'b' })).toBe('a');
    expect(otpSecret({ JWT_SECRET: 'b' })).toBe('b');
    expect(otpSecret({})).toBe('');
  });
});

describe('assertEmailCanBeSent', () => {
  const mail = (enabled: boolean) => ({ enabled, host: 'localhost', port: 1025, from: 'x@y.z' });

  it('refuses to start with the registration email check on and no way to send the code, and says how to fix it', () => {
    expect(() => assertEmailCanBeSent(otpSettings({}), mail(false))).toThrow(/AUTH_EMAIL_ENABLED=true/);
    expect(() => assertEmailCanBeSent(otpSettings({}), mail(false))).toThrow(/AUTH_EMAIL_VERIFICATION_ENABLED=false/);
  });

  it('is fine with email on, or with the check off', () => {
    expect(() => assertEmailCanBeSent(otpSettings({}), mail(true))).not.toThrow();
    expect(() =>
      assertEmailCanBeSent(otpSettings({ AUTH_EMAIL_VERIFICATION_ENABLED: 'false' }), mail(false)),
    ).not.toThrow();
  });

  it('does not stop the service starting just because two-step sign-in is offered: that is each user\'s choice', () => {
    expect(() =>
      assertEmailCanBeSent(otpSettings({ AUTH_EMAIL_VERIFICATION_ENABLED: 'false', AUTH_TWO_FACTOR_ENABLED: 'true' }), mail(false)),
    ).not.toThrow();
  });
});
