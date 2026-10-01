import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TRADE_API_URL } from './api.config';

/** LinkAccountStatusResponse from `GET /accounts/link`. */
interface LinkStatusResponse {
  readonly linked: boolean;
  readonly message: string;
  readonly accountNumber?: string;
}

export interface LinkStatus {
  readonly linked: boolean;
  readonly accountNumber: string | null;
  readonly accountId: number | null;
}

/** CreateAccountRequest in the Trade API. Omit `balance` to get the 20,000 minimum opening balance. */
export interface CreateAccountRequest {
  readonly client_name: string;
  readonly phone_no: string;
  readonly email: string;
  readonly dob?: string;
  readonly balance?: number;
}

export interface CreateAccountResult {
  readonly accountId: number;
  readonly accountNumber: string;
  readonly status: string;
  readonly message: string;
}

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface Account {
  readonly id: number;
  readonly accountId: string;
  readonly holderName: string;
  readonly cashBalance: number;
  readonly status: AccountStatus;
  readonly version: number;
  readonly lastUpdated: string;
}

export interface Balance {
  readonly accountId: number;
  readonly cashBalance: number;
  readonly currency: string;
  readonly asOf: string;
}

export interface Position {
  readonly accountId: number;
  readonly symbol: string;
  readonly quantity: number;
  readonly averageCost: number;
}

export interface OrderHistoryEntry {
  readonly orderId: string;
  readonly accountId: number;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly orderPricingType: string;
  readonly quantity: number;
  readonly price: number | null;
  readonly executedPrice: number | null;
  readonly status: string;
  readonly createdOn: string;
}

export interface AccountOverview {
  readonly account: Account;
  readonly balance: Balance;
  readonly positions: readonly Position[];
  readonly orders: readonly OrderHistoryEntry[];
}

/** Error thrown by `AccountService`; `message` is safe to show to the user as-is. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

/**
 * Talks to the Trade API's account endpoints. An account belongs to the Auth user whose id is in its
 * `user_id` column, so "linking" is automatic: `GET /accounts/link` finds it, and `POST /accounts/create`
 * refuses to create a second one (409), which keeps one user ↔ one account.
 */
@Service()
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(TRADE_API_URL);
  private readonly changes = signal(0);

  /** Bumped whenever an account is created, so views showing account data can reload. */
  readonly revision = this.changes.asReadonly();

  async getLinkStatus(): Promise<LinkStatus> {
    try {
      const response = await firstValueFrom(this.http.get<LinkStatusResponse>(`${this.baseUrl}/accounts/link`));
      const accountNumber = response.linked ? (response.accountNumber ?? null) : null;
      return { linked: response.linked, accountNumber, accountId: accountIdFromNumber(accountNumber) };
    } catch (error) {
      throw toAccountError(error);
    }
  }

  async createAccount(request: CreateAccountRequest): Promise<CreateAccountResult> {
    try {
      const result = await firstValueFrom(
        this.http.post<CreateAccountResult>(`${this.baseUrl}/accounts/create`, request),
      );
      this.changes.update((n) => n + 1);
      return result;
    } catch (error) {
      throw toAccountError(error);
    }
  }

  /** Everything the dashboard shows for one account, fetched in parallel. */
  async getOverview(accountId: number): Promise<AccountOverview> {
    const base = `${this.baseUrl}/accounts/${accountId}`;
    try {
      const [account, balance, positions, orders] = await Promise.all([
        firstValueFrom(this.http.get<Account>(base)),
        firstValueFrom(this.http.get<Balance>(`${base}/balance`)),
        firstValueFrom(this.http.get<Position[]>(`${base}/positions`)),
        firstValueFrom(this.http.get<OrderHistoryEntry[]>(`${base}/orders`)),
      ]);
      return { account, balance, positions, orders };
    } catch (error) {
      throw toAccountError(error);
    }
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

function toAccountError(error: unknown): AccountError {
  if (!(error instanceof HttpErrorResponse)) {
    return new AccountError('Something went wrong. Please try again.', -1);
  }
  const body: unknown = error.error;
  const serverMessage =
    typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message
      : '';

  switch (error.status) {
    case 0:
    case 502:
    case 503:
    case 504:
      return new AccountError('Cannot reach the trading service. Please try again shortly.', error.status);
    case 401:
      return new AccountError('Your session has expired. Please sign in again.', 401);
    case 403:
      return new AccountError('You do not have access to this account.', 403);
    case 404:
      return new AccountError('We could not find your trading account.', 404);
    case 409:
      return new AccountError('Your login is already linked to a trading account.', 409);
    case 400:
    case 422:
      return new AccountError(
        serverMessage ? `Please check your details: ${serverMessage}` : 'Please check your details and try again.',
        error.status,
      );
    default:
      return new AccountError('The trading service is having trouble right now. Please try again later.', error.status);
  }
}
