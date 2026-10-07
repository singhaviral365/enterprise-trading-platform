import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Platform-standard error response envelope.
 */
export interface ErrorResponse {
  errorCode: string;
  message: string;
  /** Only on PWD-403: how many more wrong current passwords are allowed before the session is ended. */
  attemptsLeft?: number;
}

/**
 * Auth-401: Unauthorised (login failure, expired token, invalid credentials)
 */
export class UnauthorisedException extends HttpException {
  constructor(message: string = 'Unauthorised') {
    super(
      {
        errorCode: 'AUTH-401',
        message,
      } as ErrorResponse,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Auth-409: Registration failed (username already taken)
 */
export class RegistrationFailedException extends HttpException {
  constructor(message: string = 'Registration failed') {
    super(
      {
        errorCode: 'AUTH-409',
        message,
      } as ErrorResponse,
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * VAL-422: Invalid input (validation failure)
 */
export class ValidationFailedException extends HttpException {
  constructor(message: string = 'Invalid input') {
    super(
      {
        errorCode: 'VAL-422',
        message,
      } as ErrorResponse,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * OTP-401: a one-time code (or a password-reset token) is wrong, expired, already used, or never existed. One answer for
 * all of them, so a caller cannot tell which, and cannot probe which challenges exist.
 */
export class OtpInvalidException extends HttpException {
  constructor(message: string = 'Invalid or expired code') {
    super(
      {
        errorCode: 'OTP-401',
        message,
      } as ErrorResponse,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * OTP-429: too many attempts, or a new code asked for too soon / too often. `retryAfterSeconds` says how long to wait
 * when waiting helps (0 means start again).
 */
export class OtpTooManyRequestsException extends HttpException {
  constructor(
    message: string = 'Too many attempts. Please wait and try again',
    readonly retryAfterSeconds: number = 0,
  ) {
    super(
      {
        errorCode: 'OTP-429',
        message,
      } as ErrorResponse,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** OTP-503: the code could not be sent (the mail server did not take it, or email is not available here). */
export class OtpDeliveryFailedException extends HttpException {
  constructor(message: string = 'We could not send the code') {
    super(
      {
        errorCode: 'OTP-503',
        message,
      } as ErrorResponse,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/** PWD-422: the new password is the same as the current one. */
export class PasswordReuseException extends HttpException {
  constructor(message: string = 'New password must be different from your current password') {
    super(
      {
        errorCode: 'PWD-422',
        message,
      } as ErrorResponse,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * PWD-403: the current password given while changing the password is wrong. It is a 403 and not a 401 on purpose: the
 * browser's request layer treats a 401 as "the session expired", renews it and sends the request again, which would count
 * one wrong guess twice. `attemptsLeft` says how many more are allowed.
 */
export class PasswordIncorrectException extends HttpException {
  constructor(readonly attemptsLeft: number) {
    super(
      {
        errorCode: 'PWD-403',
        message: 'Current password is incorrect',
        attemptsLeft,
      } as ErrorResponse,
      HttpStatus.FORBIDDEN,
    );
  }
}

/** PWD-423: too many wrong current passwords; the session it was tried from has been ended. */
export class PasswordLockedException extends HttpException {
  constructor(message: string = 'Too many wrong passwords. You have been signed out') {
    super(
      {
        errorCode: 'PWD-423',
        message,
      } as ErrorResponse,
      423,
    );
  }
}

