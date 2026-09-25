import {
  LoginThrottleService,
  LOGIN_THROTTLE_COOLDOWN_MS,
  LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS,
} from './login-throttle.service';

describe('LoginThrottleService', () => {
  let service: LoginThrottleService;

  beforeEach(() => {
    service = new LoginThrottleService();
  });

  it('limits repeated failed attempts from one caller', () => {
    const callerId = '198.51.100.9';
    const now = 1_700_000_000_000;

    for (let i = 1; i < LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS; i += 1) {
      service.recordFailure(callerId, now + i);
      expect(service.isBlocked(callerId, now + i)).toBe(false);
    }

    service.recordFailure(callerId, now + LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS);
    expect(service.isBlocked(callerId, now + LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS)).toBe(true);
  });

  it('unblocks caller after cooldown period', () => {
    const callerId = '203.0.113.4';
    const now = 1_700_000_000_000;
    const lockStart = now + LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS - 1;

    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS; i += 1) {
      service.recordFailure(callerId, now + i);
    }

    expect(service.isBlocked(callerId, now + 10)).toBe(true);
    expect(
      service.isBlocked(callerId, lockStart + LOGIN_THROTTLE_COOLDOWN_MS + 1),
    ).toBe(false);
  });
});