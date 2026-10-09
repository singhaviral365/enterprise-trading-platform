import { MAX_PASSWORD_CHANGE_ATTEMPTS, PasswordAttemptsService } from './password-attempts.service';

const HALF_AN_HOUR = 30 * 60 * 1000;

describe('PasswordAttemptsService', () => {
  let attempts: PasswordAttemptsService;

  beforeEach(() => {
    attempts = new PasswordAttemptsService();
  });

  it('allows three wrong passwords', () => {
    expect(MAX_PASSWORD_CHANGE_ATTEMPTS).toBe(3);
    expect(attempts.remaining('s')).toBe(3);
  });

  it('counts down with each wrong one, to zero', () => {
    expect(attempts.recordFailure('s')).toBe(2);
    expect(attempts.recordFailure('s')).toBe(1);
    expect(attempts.recordFailure('s')).toBe(0);
    expect(attempts.remaining('s')).toBe(0);
  });

  it('never goes below zero, however many more are recorded', () => {
    for (let i = 0; i < 6; i++) {
      attempts.recordFailure('s');
    }
    expect(attempts.remaining('s')).toBe(0);
    expect(attempts.recordFailure('s')).toBe(0);
  });

  it('keeps each session to itself', () => {
    attempts.recordFailure('one');
    attempts.recordFailure('one');

    expect(attempts.remaining('one')).toBe(1);
    expect(attempts.remaining('two')).toBe(3);
  });

  it('clears on reset', () => {
    attempts.recordFailure('s');
    attempts.reset('s');

    expect(attempts.remaining('s')).toBe(3);
  });

  it('lets a locked session try again after half an hour, and counts old failures as gone', () => {
    const start = 1_000_000;
    for (let i = 0; i < 3; i++) {
      attempts.recordFailure('s', start);
    }
    expect(attempts.remaining('s', start + HALF_AN_HOUR - 1)).toBe(0);

    expect(attempts.remaining('s', start + HALF_AN_HOUR)).toBe(3);
    expect(attempts.recordFailure('s', start + HALF_AN_HOUR + 1)).toBe(2);
  });

  it('restarts the count when a failure comes after the lock has run out', () => {
    const start = 1_000_000;
    attempts.recordFailure('s', start);
    attempts.recordFailure('s', start);

    expect(attempts.recordFailure('s', start + HALF_AN_HOUR + 5)).toBe(2);
  });
});
