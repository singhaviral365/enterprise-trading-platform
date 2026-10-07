import { MailSettings } from '../mail/mail.config';

/**
 * One-time code settings, from the environment. Every limit has a safe default, so nothing has to be set to run.
 *
 * | Variable | Default | Meaning |
 * |---|---|---|
 * | `AUTH_TWO_FACTOR_ENABLED` | `true` | Two-step sign-in is OFFERED: a user can switch it on for themselves in Settings. `false` removes the option, and nobody is asked for a code |
 * | `AUTH_EMAIL_VERIFICATION_ENABLED` | `true` | Registering needs the email checked with a code first. `false` creates the login straight away |
 * | `AUTH_OTP_TTL_SECONDS` | 300 | How long a sign-in code works |
 * | `AUTH_OTP_RESET_TTL_SECONDS` | 600 | How long a password-reset code, and then the reset itself, work |
 * | `AUTH_OTP_MAX_ATTEMPTS` | 5 | Wrong guesses allowed on one code before it is dead |
 * | `AUTH_OTP_RESEND_COOLDOWN_SECONDS` | 30 | Wait between two emails for the same challenge |
 * | `AUTH_OTP_MAX_SENDS` | 3 | Emails per challenge, the first included |
 * | `AUTH_OTP_SECRET` | `JWT_SECRET` | Key the stored code hashes are made with |
 */
export interface OtpSettings {
  /** Two-step sign-in is offered (each user still chooses). */
  readonly twoFactorEnabled: boolean;
  /** A registration must verify its email address before the login is created. */
  readonly emailVerificationEnabled: boolean;
  readonly codeTtlSeconds: number;
  readonly resetTtlSeconds: number;
  readonly maxAttempts: number;
  readonly resendCooldownSeconds: number;
  readonly maxSends: number;
  readonly codeLength: number;
}

/** Injection tokens: the settings, and (tests only) a clock. */
export const OTP_SETTINGS = Symbol('OTP_SETTINGS');
export const OTP_CLOCK = Symbol('OTP_CLOCK');

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function otpSettings(env: NodeJS.ProcessEnv = process.env): OtpSettings {
  return {
    twoFactorEnabled: env.AUTH_TWO_FACTOR_ENABLED !== 'false',
    emailVerificationEnabled: env.AUTH_EMAIL_VERIFICATION_ENABLED !== 'false',
    codeTtlSeconds: positiveInt(env.AUTH_OTP_TTL_SECONDS, 300),
    resetTtlSeconds: positiveInt(env.AUTH_OTP_RESET_TTL_SECONDS, 600),
    maxAttempts: positiveInt(env.AUTH_OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: positiveInt(env.AUTH_OTP_RESEND_COOLDOWN_SECONDS, 30),
    maxSends: positiveInt(env.AUTH_OTP_MAX_SENDS, 3),
    codeLength: 6,
  };
}

/** The key the stored code hashes are made with. */
export function otpSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_OTP_SECRET || env.JWT_SECRET || '';
}

/**
 * Registering verifies the email with a code, and that needs somewhere to send it. Starting with it on and no mail transport
 * would stop everybody registering, so refuse to start and say how to fix it, rather than failing at the first registration.
 * (Two-step sign-in needs email too, but it is each user's own choice, so it is refused when someone tries to switch it on.)
 */
export function assertEmailCanBeSent(otp: OtpSettings, mail: MailSettings): void {
  if (otp.emailVerificationEnabled && !mail.enabled) {
    throw new Error(
      'Email verification at registration is on (the default) but email is not enabled, so no code could be delivered. ' +
        'For development set AUTH_EMAIL_ENABLED=true (MailHog on localhost:1025), or turn the check off with ' +
        'AUTH_EMAIL_VERIFICATION_ENABLED=false.',
    );
  }
}
