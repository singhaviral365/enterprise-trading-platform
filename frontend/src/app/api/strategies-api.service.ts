import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateStrategyRequest,
  Strategy,
  StrategiesService,
  StrategyRun,
  StrategyTrailService,
} from './generated/strategies';

/**
 * App-facing wrapper over the generated Strategies clients (the automated strategy module of the Trade REST API).
 * The generated services expose observe/reportProgress overloads; callers here just get the response body.
 */
@Service()
export class StrategiesApi {
  private readonly strategies = inject(StrategiesService);
  private readonly trail = inject(StrategyTrailService);

  list(accountId: number): Observable<Strategy[]> {
    return this.strategies.listStrategies(accountId);
  }

  create(request: CreateStrategyRequest): Observable<Strategy> {
    return this.strategies.createStrategy(request);
  }

  /** Switches a strategy off (`false`) or back on (`true`). */
  setEnabled(strategyId: number, enabled: boolean): Observable<Strategy> {
    return this.strategies.updateStrategy(strategyId, { enabled });
  }

  cancel(strategyId: number): Observable<Strategy> {
    return this.strategies.cancelStrategy(strategyId);
  }

  runs(strategyId: number): Observable<StrategyRun[]> {
    return this.trail.listStrategyRuns(strategyId);
  }
}
