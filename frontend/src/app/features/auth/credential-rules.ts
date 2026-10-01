/**
 * Registration rules for usernames and passwords, mirroring the Auth service
 * (backend/auth-service/src/auth/credential-rules.ts); keep the two in step.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Returns a readable reason the username breaks the pattern rules, or '' when it is fine. */
export function usernameProblem(value: string): string {
  if (!value) {
    return '';
  }
  if (!/^[A-Za-z]/.test(value)) {
    return 'Username must start with a letter.';
  }
  if (/[^A-Za-z0-9._-]/.test(value)) {
    return 'Use only letters, numbers, dots, underscores and hyphens.';
  }
  if (/[._-]{2}/.test(value)) {
    return "Dots, underscores and hyphens can't be next to each other.";
  }
  if (/[._-]$/.test(value)) {
    return "Username can't end with a dot, underscore or hyphen.";
  }
  if (!/[0-9]/.test(value)) {
    return 'Username must contain at least one number.';
  }
  if (!/[._-]/.test(value)) {
    return 'Username must contain at least one of . _ -';
  }
  return '';
}

export interface CredentialRule {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
}

/** Every username rule with whether `username` currently satisfies it (drives the checklist). */
export function usernameRules(username: string): readonly CredentialRule[] {
  return [
    {
      id: 'length',
      label: `${USERNAME_MIN}–${USERNAME_MAX} characters`,
      met: username.length >= USERNAME_MIN && username.length <= USERNAME_MAX,
    },
    { id: 'letter', label: 'Starts with a letter', met: /^[A-Za-z]/.test(username) },
    { id: 'digit', label: 'One number (0–9)', met: /[0-9]/.test(username) },
    {
      id: 'symbol',
      label: 'One of . _ - (between characters)',
      met: /[._-]/.test(username) && /^[A-Za-z](?:[._-]?[A-Za-z0-9])*$/.test(username),
    },
  ];
}

/** Every password rule with whether `password` currently satisfies it (drives the checklist). */
export function passwordRules(password: string, username: string): readonly CredentialRule[] {
  const sameAsUsername =
    password.length > 0 && password.trim().toLowerCase() === username.trim().toLowerCase();
  return [
    {
      id: 'length',
      label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
      met: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    },
    { id: 'upper', label: 'One capital letter (A–Z)', met: /[A-Z]/.test(password) },
    { id: 'digit', label: 'One number (0–9)', met: /[0-9]/.test(password) },
    { id: 'symbol', label: 'One special symbol, e.g. ! @ # $ %', met: /[^A-Za-z0-9\s]/.test(password) },
    { id: 'different', label: 'Different from your username', met: password.length > 0 && !sameAsUsername },
  ];
}
