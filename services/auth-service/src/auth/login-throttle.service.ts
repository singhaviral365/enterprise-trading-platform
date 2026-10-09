import { Injectable } from '@nestjs/common';

export const LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_THROTTLE_COOLDOWN_MS = 5 * 60 * 1000;

type ThrottleState = {
  failedAttempts: number;
  blockedUntil?: number;
};

@Injectable()
export class LoginThrottleService {
  private readonly attemptsByCaller = new Map<string, ThrottleState>();

  isBlocked(callerId: string, nowMs: number = Date.now()): boolean {
    const state = this.attemptsByCaller.get(callerId);
    if (!state || !state.blockedUntil) {
      return false;
    }

    if (nowMs >= state.blockedUntil) {
      this.attemptsByCaller.delete(callerId);
      return false;
    }

    return true;
  }

  recordFailure(callerId: string, nowMs: number = Date.now()): void {
    const blocked = this.isBlocked(callerId, nowMs);
    if (blocked) {
      return;
    }

    const state = this.attemptsByCaller.get(callerId) ?? {
      failedAttempts: 0,
    };

    state.failedAttempts += 1;

    if (state.failedAttempts >= LOGIN_THROTTLE_MAX_FAILED_ATTEMPTS) {
      state.blockedUntil = nowMs + LOGIN_THROTTLE_COOLDOWN_MS;
    }

    this.attemptsByCaller.set(callerId, state);
  }

  reset(callerId: string): void {
    this.attemptsByCaller.delete(callerId);
  }
}