import { Service, computed, inject, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { TradeApi } from '../api/trade-api.service';
import {
  AccountResponse,
  BalanceResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  OrderHistoryEntry,
  PositionResponse,
} from '../api/generated/trade';
import { describeError } from './errors/describe-error';
import { SessionService } from './session.service';

export interface AccountOverview {
  readonly account: AccountResponse;
  readonly balance: BalanceResponse;
  readonly positions: readonly PositionResponse[];
  readonly orders: readonly OrderHistoryEntry[];
}

export type AccountOverviewState =
  | { readonly linked: false }
  | { readonly linked: true; readonly accountNumber: string; readonly overview: AccountOverview };

/**
 * The signed-in user's linked account, loaded once and shared by the dashboard and the header's
 * account menu. Reloads when the user changes or an account is created; idle while signed out.
 *
 * An account belongs to the Auth user whose id is in its `user_id` column, so "linking" is
 * automatic: `GET /accounts/link` finds it, and `POST /accounts/create` refuses a second one (409).
 * All calls go through the generated Trade client (`TradeApi`).
 */
@Service()
export class AccountOverviewStore {
  private readonly session = inject(SessionService);
  private readonly trade = inject(TradeApi);
  private readonly changes = signal(0);

  readonly data = resource({
    params: () =>
      this.session.isLoggedIn() ? { user: this.session.username(), revision: this.changes() } : undefined,
    loader: async (): Promise<AccountOverviewState> => {
      const link = await firstValueFrom(this.trade.accountLink());
      const accountNumber = link.linked ? (link.accountNumber ?? null) : null;
      const accountId = accountIdFromNumber(accountNumber);
      if (accountNumber === null || accountId === null) {
        return { linked: false };
      }
      const [account, balance, positions, orders] = await Promise.all([
        firstValueFrom(this.trade.account(accountId)),
        firstValueFrom(this.trade.balance(accountId)),
        firstValueFrom(this.trade.positions(accountId)),
        firstValueFrom(this.trade.orderHistory(accountId)),
      ]);
      return { linked: true, accountNumber, overview: { account, balance, positions, orders } };
    },
  });

  /** The linked account, or null while loading, on error, or when none is linked. */
  readonly linked = computed(() => {
    const value = this.data.hasValue() ? this.data.value() : null;
    return value?.linked ? value : null;
  });

  readonly errorMessage = computed(() => {
    const error = this.data.error();
    return error ? describeError(error) : '';
  });

  /** Opens the user's account; every view showing account data then loads it. */
  async createAccount(request: CreateAccountRequest): Promise<CreateAccountResponse> {
    const created = await firstValueFrom(this.trade.createAccount(request));
    this.changes.update((n) => n + 1);
    return created;
  }

  /** Refreshes in the background: the current value stays on screen while the reload runs. */
  reload(): void {
    this.data.reload();
  }
}

/**
 * The link response carries only the account number. The Trade API builds it as "ACC" followed by
 * the zero-padded account id (TradeService.formatAccountNumber), so the id can be read back from it.
 */
export function accountIdFromNumber(accountNumber: string | null): number | null {
  const match = accountNumber ? /^ACC(\d+)$/.exec(accountNumber) : null;
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
