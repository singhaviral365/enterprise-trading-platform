import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { ErrorResponseErrorCodeEnum as AuthErrorCode } from '../../api/generated/auth';
import { ErrorResponseErrorCodeEnum as TradeErrorCode } from '../../api/generated/trade';
import { NotificationService } from '../notification.service';
import { ApiErrorNotifier } from './api-error-notifier';
import { describeError, errorCodeOf } from './describe-error';
import {
  ERROR_MESSAGES,
  LOGIN_ERRORS,
  NETWORK_ERROR_MESSAGE,
  REGISTER_ERRORS,
  SERVER_ERROR_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from './error-messages';

function failure(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('error catalogue messages', () => {
  const contractCodes: string[] = [
    ...Object.values(AuthErrorCode),
    ...Object.values(TradeErrorCode),
  ];

  it('reads codes from both contracts', () => {
    expect(contractCodes).toContain('AUTH-409');
    expect(contractCodes).toContain('ORD-409');
  });

  it('maps every code in both catalogues to a readable message', () => {
    for (const code of contractCodes) {
      const message = describeError(failure(400, { errorCode: code, message: 'dev text' }));
      expect(message, code).toBe(ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES]);
      expect(message.trim().length, code).toBeGreaterThan(20);
      expect(message, code).not.toContain('dev text');
    }
  });

  it('has no entry for a code that is in neither contract', () => {
    for (const code of Object.keys(ERROR_MESSAGES)) {
      expect(contractCodes, code).toContain(code);
    }
  });

  it('branches on the code, not the server message', () => {
    const a = describeError(failure(409, { errorCode: 'ORD-409', message: 'Duplicate order' }));
    const b = describeError(failure(409, { errorCode: 'ORD-409', message: 'anything else' }));
    expect(a).toBe(b);
  });

  it('falls back to a readable sentence for an unrecognised code', () => {
    const message = describeError(failure(418, { errorCode: 'XYZ-999', message: 'teapot' }));
    expect(message).toContain(UNKNOWN_ERROR_MESSAGE);
    expect(message).toContain('XYZ-999');
  });

  it('does not treat object prototype names as known codes', () => {
    expect(describeError(failure(400, { errorCode: 'constructor' }))).toContain(
      UNKNOWN_ERROR_MESSAGE,
    );
  });

  it('falls back when the body has no code or is not JSON', () => {
    expect(describeError(failure(400, { message: 'x' }))).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(describeError(failure(400, '<html>bad</html>'))).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(describeError(failure(400, null))).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(describeError(new Error('boom'))).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(describeError(undefined)).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  it('renders a server-trouble sentence for a 5xx with no known code', () => {
    expect(describeError(failure(502, '<html>Bad Gateway</html>'))).toBe(SERVER_ERROR_MESSAGE);
  });

  it('renders a readable sentence when the request never reached a service (status 0)', () => {
    const message = describeError(
      new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }),
    );
    expect(message).toBe(NETWORK_ERROR_MESSAGE);
    expect(message.length).toBeGreaterThan(20);
  });

  it('lets a screen override the sentence for a status (rejected login is not an expired session)', () => {
    const rejected = failure(401, { errorCode: 'AUTH-401', message: 'Unauthorised' });
    expect(describeError(rejected)).toBe(ERROR_MESSAGES['AUTH-401']);
    expect(describeError(rejected, { byStatus: LOGIN_ERRORS })).toBe('Incorrect username or password.');
    expect(describeError(failure(409, { errorCode: 'AUTH-409' }), { byStatus: REGISTER_ERRORS })).toContain(
      'already registered',
    );
  });

  it('keeps the generic sentence for statuses a screen does not override', () => {
    const message = describeError(failure(500, { errorCode: 'SRV-500' }), { byStatus: LOGIN_ERRORS });
    expect(message).toBe(ERROR_MESSAGES['SRV-500']);
  });

  it('asks the user to wait after a 429', () => {
    expect(describeError(failure(429, null))).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });

  it('extracts the code for callers that branch on it', () => {
    expect(errorCodeOf(failure(409, { errorCode: 'ACC-409' }))).toBe('ACC-409');
    expect(errorCodeOf(failure(0, null))).toBeUndefined();
    expect(errorCodeOf('nope')).toBeUndefined();
  });

  it('shows the sentence as an error notification', () => {
    TestBed.configureTestingModule({});
    TestBed.inject(ApiErrorNotifier).show(failure(0, null));
    const [toast] = TestBed.inject(NotificationService).notifications();
    expect(toast.type).toBe('error');
    expect(toast.message).toBe(NETWORK_ERROR_MESSAGE);
  });
});
