import { HttpErrorResponse } from '@angular/common/http';

import {
  ERROR_MESSAGES,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  StatusMessages,
  TOO_MANY_REQUESTS_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
  isKnownErrorCode,
} from './error-messages';

/** The contract's `errorCode` from a failed HTTP call, or undefined when the body has none. */
export function errorCodeOf(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'errorCode' in body) {
    const code = (body as { errorCode: unknown }).errorCode;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
  }
  return undefined;
}

export interface DescribeErrorOptions {
  /** Sentences for specific HTTP statuses on this screen; they win over the generic code-based ones. */
  readonly byStatus?: StatusMessages;
}

/**
 * Turns any failure into a sentence for the user. Branches on the contract's `errorCode`
 * (or, for `options.byStatus`, the HTTP status), never on the server's `message`.
 * Always returns text, never an empty string.
 */
export function describeError(error: unknown, options: DescribeErrorOptions = {}): string {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    // No response at all: service down, connection lost, or a CORS rule blocking this origin.
    return NETWORK_ERROR_MESSAGE;
  }

  const override = error instanceof HttpErrorResponse ? options.byStatus?.[error.status] : undefined;
  if (override) {
    return override;
  }

  const code = errorCodeOf(error);
  if (isKnownErrorCode(code)) {
    return ERROR_MESSAGES[code];
  }

  if (error instanceof HttpErrorResponse && error.status === 429) {
    return TOO_MANY_REQUESTS_MESSAGE;
  }
  if (error instanceof HttpErrorResponse && error.status >= 500) {
    return code ? `${SERVER_ERROR_MESSAGE} (reference: ${code})` : SERVER_ERROR_MESSAGE;
  }
  // A code this app has never seen, or a response without one.
  return code ? `${UNKNOWN_ERROR_MESSAGE} (reference: ${code})` : UNKNOWN_ERROR_MESSAGE;
}
