import { ErrorResponseErrorCodeEnum as AuthErrorCode } from '../../api/generated/auth';
import { ErrorResponseErrorCodeEnum as TradeErrorCode } from '../../api/generated/trade';

/**
 * Every code either contract can return. Derived from the generated enums, so it follows the
 * contracts: when a contract gains a code and the clients are regenerated, `ERROR_MESSAGES` below
 * stops compiling until that code has a sentence.
 */
export type ErrorCode = `${AuthErrorCode}` | `${TradeErrorCode}`;

/** Sentences a trader can act on. Keyed by code, never by the developer-facing `message`. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  // Auth service
  'AUTH-401':
    'Your session has expired or your sign-in details were not accepted. Please sign in again.',
  'AUTH-409':
    'We could not complete your registration. Try a different username, or sign in if you already have an account.',
  // One-time codes (two-step sign-in, forgot password)
  'OTP-401':
    'That code is not right, or it has expired. Check the latest email we sent you, or ask for a new code.',
  'OTP-429': 'Too many attempts. Please wait a few minutes and try again.',
  'OTP-503': 'We could not send the code right now. Please try again in a moment.',
  'PWD-422': 'Your new password must be different from your current password.',
  'PWD-403': 'That is not your current password.',
  'PWD-423': 'Too many wrong passwords. You have been signed out.',
  // Shared by both services
  'VAL-422':
    'Some of the details you entered are not valid. Check the highlighted fields and try again.',
  // Trade API
  'ACC-404': 'We could not find that trading account. Check the account and try again.',
  'ACC-403':
    'This account is not active, so it cannot trade right now. Contact support to reactivate it.',
  'ACC-409':
    'This account is not linked to your login, or your login already has an account. Open your profile to check your linked account.',
  'INS-404': 'That instrument is not available for trading. Check the symbol and try again.',
  'ORD-400': 'You do not have enough cash for this order. Reduce the quantity or add funds.',
  'ORD-409':
    'This order could not be placed or cancelled. You may not hold enough shares, it may have been submitted already, or it has already been filled. Check your orders and try again.',
  'RES-404':
    'That page or service could not be found. Refresh and try again; if it keeps happening, contact support.',
  'SRV-500': 'The trading service hit an unexpected problem. Please try again in a moment.',
  'FX-503':
    'We could not get a currency exchange rate for this order right now. Please try again in a moment, or place a market order.',
};

export const NETWORK_ERROR_MESSAGE =
  'We could not reach the service. Check your internet connection and try again. If the problem continues, the service may be down.';
export const SERVER_ERROR_MESSAGE =
  'The service is having trouble right now. Please try again in a moment.';
export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function isKnownErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_MESSAGES, code);
}

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many attempts. Please wait a moment and try again.';

/**
 * Context-specific sentences that beat the generic code-based ones for a given HTTP status. Pass one
 * as `describeError(error, { byStatus: LOGIN_ERRORS })`. A rejected login is `AUTH-401`, whose
 * catalogue sentence talks about an expired session, which would be wrong on the sign-in form.
 */
export type StatusMessages = Readonly<Partial<Record<number, string>>>;

export const LOGIN_ERRORS: StatusMessages = {
  400: 'Please check your username and password.',
  401: 'Incorrect username or password.',
  422: 'Please check your username and password.',
};

export const REGISTER_ERRORS: StatusMessages = {
  409: 'That username or email is already registered. Please choose another.',
};
