/**
 * Registration rules for usernames and passwords. The frontend register form mirrors these
 * (frontend/src/app/features/auth/credential-rules.ts); keep the two in step.
 */

/**
 * Starts with a letter; then letters/digits, where a single '.', '_' or '-' may separate them.
 * So it cannot end with, or repeat, those separators. Length is checked separately (3-64).
 */
export const USERNAME_PATTERN = /^[A-Za-z](?:[._-]?[A-Za-z0-9])*$/;

/** A username must also contain at least one number and one of the allowed symbols . _ - */
export const USERNAME_DIGIT = /[0-9]/;
export const USERNAME_SYMBOL = /[._-]/;

export const PASSWORD_UPPERCASE = /[A-Z]/;
export const PASSWORD_DIGIT = /[0-9]/;
/** Any printable character that is not a letter, digit or whitespace, e.g. ! @ # $ % & * ? */
export const PASSWORD_SYMBOL = /[^A-Za-z0-9\s]/;
