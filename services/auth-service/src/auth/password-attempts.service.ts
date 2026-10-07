import { Injectable } from '@nestjs/common';

/** Wrong current passwords allowed while changing the password, from one session, before it is ended. */
export const MAX_PASSWORD_CHANGE_ATTEMPTS = 3;

/** A session that has used up its tries stays locked out of the change for this long. */
const LOCK_MS = 30 * 60 * 1000;

interface State {
  failures: number;
  lastFailureAt: number;
}

/**
 * Counts the wrong current passwords typed on the change-password screen, per session (the refresh token's hash; for a
 * client with no cookie, the user). Three wrong ones end the session; the count then stays put, so the access token the
 * ended session still holds for a few minutes cannot go on guessing. A right password clears it, and so does half an hour.
 *
 * In memory, like the login throttle: it is per instance and does not survive a restart.
 */
@Injectable()
export class PasswordAttemptsService {
  private readonly states = new Map<string, State>();

  /** How many more wrong passwords this session may type. 0 means it is locked. */
  remaining(key: string, nowMs: number = Date.now()): number {
    const state = this.states.get(key);
    if (!state) {
      return MAX_PASSWORD_CHANGE_ATTEMPTS;
    }
    if (nowMs - state.lastFailureAt >= LOCK_MS) {
      this.states.delete(key);
      return MAX_PASSWORD_CHANGE_ATTEMPTS;
    }
    return Math.max(0, MAX_PASSWORD_CHANGE_ATTEMPTS - state.failures);
  }

  /** Records a wrong password and returns how many tries are left. */
  recordFailure(key: string, nowMs: number = Date.now()): number {
    const current = this.states.get(key);
    const failures = (current && nowMs - current.lastFailureAt < LOCK_MS ? current.failures : 0) + 1;
    this.states.set(key, { failures, lastFailureAt: nowMs });
    return Math.max(0, MAX_PASSWORD_CHANGE_ATTEMPTS - failures);
  }

  reset(key: string): void {
    this.states.delete(key);
  }
}
