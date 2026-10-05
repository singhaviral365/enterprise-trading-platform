import { InjectionToken } from '@angular/core';

export interface OrderPollConfig {
  /** Pause between re-reads while something is at NEW. */
  readonly intervalMs: number;
  /** Re-reads allowed before automatic updates pause; `AccountOverviewStore.refresh()` grants a fresh allowance. */
  readonly maxPolls: number;
}

/** 12 re-reads, 5 seconds apart: about a minute of automatic updates, never an endless loop. */
export const ORDER_POLL = new InjectionToken<OrderPollConfig>('ORDER_POLL', {
  factory: () => ({ intervalMs: 5000, maxPolls: 12 }),
});
