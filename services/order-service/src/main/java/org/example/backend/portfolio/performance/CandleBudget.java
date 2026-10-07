package org.example.backend.portfolio.performance;

/**
 * How many candle calls one run of the job may make. The daily Fauxnance quota (2000) is shared with everything else that
 * prices, so a run spends at most this many, and stops for good the moment Fauxnance says the quota is used up: what was
 * stored stays, and the next run carries on.
 */
public final class CandleBudget {

    private int remaining;
    private boolean stopped;

    public CandleBudget(int calls) {
        this.remaining = Math.max(0, calls);
    }

    /** True if another call may be made now, and counts it. */
    public synchronized boolean tryTake() {
        if (stopped || remaining <= 0) {
            return false;
        }
        remaining--;
        return true;
    }

    /** The quota is exhausted (or the budget was spent): nothing more this run. */
    public synchronized void stop() {
        stopped = true;
    }

    public synchronized boolean isStopped() {
        return stopped || remaining <= 0;
    }

    public synchronized int remaining() {
        return remaining;
    }
}
