import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Platform-standard error response envelope.
 */
export interface ErrorResponse {
  errorCode: string;
  message: string;
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
