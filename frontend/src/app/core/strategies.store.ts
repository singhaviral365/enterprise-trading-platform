import { Service, computed, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CreateStrategyRequest, Strategy, StrategyRun, StrategyStatus } from '../api/generated/strategies';
import { StrategiesApi } from '../api/strategies-api.service';
import { AccountOverviewStore } from './account-overview.store';
import { describeError } from './errors/describe-error';

/** The statuses a strategy can still leave, as opposed to the four final ones. */
const OPEN: readonly StrategyStatus[] = [StrategyStatus.Active, StrategyStatus.Executing, StrategyStatus.Disabled];

/**
 * The signed-in customer's automated strategies, loaded once and shared by the page that lists them. Reloads when the
 * linked account changes; idle while there is none.
 *
 * A strategy's status is moved by the executor-service as well as by the customer (it claims one when its trigger is met,
 * and stops or expires one), so the page calls {@link reload} on a timer and this store never assumes what it holds is
 * current. A change the customer makes is written into the list straight away from the answer, then the next reload
 * reconciles it.
 */
@Service()
export class StrategiesStore {
  private readonly api = inject(StrategiesApi);
  private readonly accounts = inject(AccountOverviewStore);

  /** The linked account's numeric key, or null while there is none. */
  readonly accountId = computed(() => this.accounts.linked()?.overview.account.id ?? null);

  /** The linked account's currency: what the customer's order limit is checked in. */
  readonly accountCurrency = computed(() => this.accounts.linked()?.overview.balance.currency ?? null);

  readonly data = resource({
    params: () => this.accountId() ?? undefined,
    loader: ({ params: accountId }) => firstValueFrom(this.api.list(accountId)),
  });

  readonly strategies = computed<readonly Strategy[]>(() => (this.data.hasValue() ? this.data.value() : []));
  /** How many are still open (active, being run, or switched off): what the platform caps per account. */
  readonly openCount = computed(() => this.strategies().filter((s) => OPEN.includes(s.status)).length);
  readonly errorMessage = computed(() => {
    const error = this.data.error();
    return error ? describeError(error) : '';
  });

  /** Refreshes in the background: the list on screen stays while the reload runs. */
  reload(): void {
    this.data.reload();
  }

  async create(request: Omit<CreateStrategyRequest, 'accountId'>): Promise<Strategy> {
    const accountId = this.accountId();
    if (accountId === null) {
      throw new Error('There is no linked account to create a strategy on.');
    }
    const created = await firstValueFrom(this.api.create({ ...request, accountId }));
    this.data.update((list) => [created, ...(list ?? [])]);
    return created;
  }

  /** Switches a strategy off or back on. The answer is the strategy as it is now. */
  async setEnabled(strategyId: number, enabled: boolean): Promise<Strategy> {
    return this.replace(await firstValueFrom(this.api.setEnabled(strategyId, enabled)));
  }

  async cancel(strategyId: number): Promise<Strategy> {
    return this.replace(await firstValueFrom(this.api.cancel(strategyId)));
  }

  /** What a strategy did and why, newest first. */
  runs(strategyId: number): Promise<StrategyRun[]> {
    return firstValueFrom(this.api.runs(strategyId));
  }

  private replace(updated: Strategy): Strategy {
    this.data.update((list) => (list ?? []).map((s) => (s.strategyId === updated.strategyId ? updated : s)));
    return updated;
  }
}
