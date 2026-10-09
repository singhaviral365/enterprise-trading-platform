import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from '../exceptions';

/**
 * Global exception filter that converts all exceptions to the platform error envelope.
 * Handles:
 * - Validation errors (BAD_REQUEST) -> VAL-422
 * - Custom auth exceptions -> AUTH-401, AUTH-409
 * - Generic exceptions -> 500
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = 500;
    let errorResponse: ErrorResponse = {
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };

    // Handle NestJS HttpException (includes our custom auth exceptions)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // If it's already our error format, use it
      if (
        exceptionResponse.errorCode &&
        exceptionResponse.message &&
        typeof exceptionResponse.message === 'string'
      ) {
        errorResponse = exceptionResponse as ErrorResponse;
      } else if (statusCode === 400) {
        // Validation error from ValidationPipe
        errorResponse = {
          errorCode: 'VAL-422',
          message: 'Invalid input',
        };
        statusCode = 422;
      } else {
        // Generic HTTP exception
        errorResponse = {
          errorCode: `HTTP_${statusCode}`,
          message: exceptionResponse.message || exception.message,
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled error:', exception);
      errorResponse = {
        errorCode: 'INTERNAL_ERROR',
        message: 'Internal server error',
      };
    }

    response.status(statusCode).json(errorResponse);
  }
}
