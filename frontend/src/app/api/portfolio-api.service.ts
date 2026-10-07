import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  PLService,
  PnlResponse,
  PortfolioService,
  PortfolioSummary,
  PricedPosition,
  RealisedPnlResponse,
} from './generated/portfolio';
import { PerformanceBuilding, PerformanceResponse, PerformanceService } from './generated/portfolio-performance';

export interface PerformanceQuery {
  /** First day to include (`YYYY-MM-DD`). */
  from?: string;
  /** Last day to include (`YYYY-MM-DD`). */
  to?: string;
  /** A configured benchmark symbol, such as `SPY`. */
  benchmark?: string;
}

/** What the performance route answers: the history, or "building" (HTTP 202) the first time it is asked for. */
export type PerformanceAnswer = PerformanceResponse | PerformanceBuilding;

export function isBuilding(answer: PerformanceAnswer): answer is PerformanceBuilding {
  return !('points' in answer);
}

export interface PnlQuery {
  /** Include realised profit and loss booked on or after this date (`YYYY-MM-DD`). */
  from?: string;
  /** Include realised profit and loss booked on or before this date (`YYYY-MM-DD`). */
  to?: string;
  /** Add the per-instrument breakdown. */
  bySymbol?: boolean;
}

/**
 * App-facing wrapper over the generated Portfolio client (the portfolio module of the Trade REST API).
 * The generated services expose observe/reportProgress overloads; callers here just get the response body.
 * Every call fails with the client's `HttpErrorResponse`; a `503` with `MKT-503` means no price could be obtained.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioApi {
  private readonly portfolio = inject(PortfolioService);
  private readonly pnlService = inject(PLService);
  private readonly performanceService = inject(PerformanceService);

  summary(accountId: number): Observable<PortfolioSummary> {
    return this.portfolio.getPortfolioSummary(accountId);
  }

  positions(accountId: number, symbol?: string): Observable<PricedPosition[]> {
    return this.portfolio.getPricedPositions(accountId, symbol || undefined);
  }

  pnl(accountId: number, query: PnlQuery = {}): Observable<PnlResponse> {
    return this.pnlService.getPnl(accountId, query.from || undefined, query.to || undefined, query.bySymbol);
  }

  /** The closed-day history and NAV curve. Reads stored statements only (the server never calls the vendor for it). */
  performance(accountId: number, query: PerformanceQuery = {}): Observable<PerformanceAnswer> {
    return this.performanceService
      .getPerformance(accountId, query.from || undefined, query.to || undefined, query.benchmark || undefined)
      .pipe(map((answer) => answer as PerformanceAnswer));
  }

  /** Only what was booked at sales. It needs no price, so it still answers when every other route says `MKT-503`. */
  realised(accountId: number, query: PnlQuery = {}): Observable<RealisedPnlResponse> {
    return this.pnlService.getRealisedPnl(accountId, query.from || undefined, query.to || undefined, query.bySymbol);
  }
}
