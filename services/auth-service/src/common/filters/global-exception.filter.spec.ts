import { ArgumentsHost, BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RegistrationFailedException, UnauthorisedException } from '../exceptions';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes our own error envelope through with its status', () => {
    filter.catch(new UnauthorisedException('Unauthorised'), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  it('keeps the status and code of a registration conflict', () => {
    filter.catch(new RegistrationFailedException(), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ errorCode: 'AUTH-409', message: 'Registration failed' });
  });

  it('turns a validation-pipe failure (400) into VAL-422 / 422 without echoing the field errors', () => {
    filter.catch(new BadRequestException(['password is too short', 'username is invalid']), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({ errorCode: 'VAL-422', message: 'Invalid input' });
  });

  it('wraps any other HTTP exception with its status in an HTTP_<status> code', () => {
    filter.catch(new NotFoundException('No such route'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ errorCode: 'HTTP_404', message: 'No such route' });
  });

  it('falls back to the exception message when the HTTP exception response has none', () => {
    filter.catch(new HttpException({}, 418), host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json.mock.calls[0][0].errorCode).toBe('HTTP_418');
  });

  it('hides the detail of an unexpected error: 500, a generic body and the real error only in the log', () => {
    const boom = new Error('connection to db-prod-01 refused');

    filter.catch(boom, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ errorCode: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(json.mock.calls)).not.toContain('db-prod-01');
    expect(Logger.prototype.error).toHaveBeenCalledWith('Unhandled error:', boom);
  });

  it('also answers 500 for something that is not an Error at all', () => {
    filter.catch('just a string', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ errorCode: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
