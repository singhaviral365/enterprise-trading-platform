export interface EmailMessage {
  readonly subject: string;
  readonly body: string;
}

const SIGNATURE = '\n\n--\nEnterprise Trading Platform';

function minutes(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds / 60));
  return whole === 1 ? '1 minute' : `${whole} minutes`;
}

/** The email that carries a sign-in code. Plain text, no link: nothing to click, nothing to forge. */
export function loginCodeMessage(code: string, expiresInSeconds: number): EmailMessage {
  return {
    subject: `Your sign-in code: ${code}`,
    body:
      `Your sign-in code is ${code}.\n\n` +
      `It works for ${minutes(expiresInSeconds)} and only once. If you did not just try to sign in, ` +
      `someone else knows your password: change it, and do not share this code with anyone.` +
      SIGNATURE,
  };
}

/** The email that carries a registration code: proof that the address is the person's own. */
export function registrationCodeMessage(code: string, expiresInSeconds: number): EmailMessage {
  return {
    subject: `Verify your email: ${code}`,
    body:
      `Your verification code is ${code}.\n\n` +
      `Enter it to finish creating your login. It works for ${minutes(expiresInSeconds)} and only once. ` +
      `If you did not try to register, you can ignore this email: no login has been created. Do not share this code with anyone.` +
      SIGNATURE,
  };
}

/** The email that carries a password-reset code. */
export function passwordResetCodeMessage(code: string, expiresInSeconds: number): EmailMessage {
  return {
    subject: `Your password reset code: ${code}`,
    body:
      `Your password reset code is ${code}.\n\n` +
      `It works for ${minutes(expiresInSeconds)} and only once. If you did not ask to reset your password, ` +
      `you can ignore this email: your password has not been changed. Do not share this code with anyone.` +
      SIGNATURE,
  };
}

/** Sent after a password was changed, so a change nobody asked for is noticed. */
export function passwordChangedMessage(): EmailMessage {
  return {
    subject: 'Your password was changed',
    body:
      'The password for your account was just changed, and you have been signed out everywhere.\n\n' +
      'If this was you, there is nothing more to do. If it was not, reset your password straight away.' +
      SIGNATURE,
  };
}

/** `alice.trader@example.com` becomes `a***@example.com`: enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
