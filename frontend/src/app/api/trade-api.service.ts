import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AccountResponse,
  AccountsService,
  BalanceResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  LinkAccountStatusResponse,
  OnboardingService,
  OrderHistoryEntry,
  OrderResponse,
  OrderStatus,
  OrdersService,
  PlaceOrderRequest,
  PositionResponse,
} from './generated/trade';

export interface OrderHistoryFilter {
  status?: OrderStatus;
  from?: string;
  to?: string;
}

/**
 * App-facing wrapper over the generated Trade clients. The generated services expose
 * observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class TradeApi {
  private readonly orders = inject(OrdersService);
  private readonly accounts = inject(AccountsService);
  private readonly onboarding = inject(OnboardingService);

  placeOrder(request: PlaceOrderRequest): Observable<OrderResponse> {
    return this.orders.placeOrder(request);
  }

  cancelOrder(orderId: string): Observable<OrderResponse> {
    return this.orders.cancelOrder(orderId);
  }

  account(accountId: number): Observable<AccountResponse> {
    return this.accounts.getAccount(accountId);
  }

  balance(accountId: number): Observable<BalanceResponse> {
    return this.accounts.getBalance(accountId);
  }

  positions(accountId: number): Observable<PositionResponse[]> {
    return this.accounts.getPositions(accountId);
  }

  orderHistory(accountId: number, filter: OrderHistoryFilter = {}): Observable<OrderHistoryEntry[]> {
    return this.accounts.getOrders(accountId, filter.status, filter.from, filter.to);
  }

  createAccount(request: CreateAccountRequest): Observable<CreateAccountResponse> {
    return this.onboarding.createAccount(request);
  }

  accountLink(): Observable<LinkAccountStatusResponse> {
    return this.onboarding.getAccountLink();
  }
}
