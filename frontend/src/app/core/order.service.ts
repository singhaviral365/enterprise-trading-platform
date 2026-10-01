import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TRADE_API_URL } from './api.config';

export type OrderSide = 'BUY' | 'SELL';
export type OrderPricingType = 'LIMIT' | 'MARKET';

/** PlaceOrderRequest in the Trade API. `price` is required for LIMIT and must be left out for MARKET. */
export interface PlaceOrderRequest {
  readonly accountId: number;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly orderPricingType: OrderPricingType;
  readonly quantity: number;
  readonly price?: number;
  /** Unique per order attempt (8–100 chars); resending the same key cannot create a second order. */
  readonly idempotencyKey: string;
}

/** OrderResponse from `POST /orders`. A new order is NEW until the trade-executor fills or rejects it. */
export interface PlacedOrder {
  readonly orderId: string;
  readonly status: 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  readonly message: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly orderPricingType: OrderPricingType;
  readonly quantity: number;
  readonly price: number | null;
}

/** Error thrown by `OrderService`; `message` is safe to show to the user as-is. */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

/** Places orders through the Trade API's `POST /orders` (TradeController.placeOrder). */
@Service()
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(TRADE_API_URL);

  async placeOrder(request: PlaceOrderRequest): Promise<PlacedOrder> {
    try {
      return await firstValueFrom(this.http.post<PlacedOrder>(`${this.baseUrl}/orders`, request));
    } catch (error) {
      throw toOrderError(error, request.side);
    }
  }
}

/** A fresh idempotency key for one order attempt. */
export function newIdempotencyKey(): string {
  return `ord-${crypto.randomUUID()}`;
}

function toOrderError(error: unknown, side: OrderSide): OrderError {
  if (!(error instanceof HttpErrorResponse)) {
    return new OrderError('Something went wrong placing your order. Please try again.', -1);
  }
  const body: unknown = error.error;
  const field = (name: string): string =>
    typeof body === 'object' && body !== null && name in body && typeof (body as Record<string, unknown>)[name] === 'string'
      ? ((body as Record<string, unknown>)[name] as string)
      : '';
  const errorCode = field('errorCode') || undefined;
  const serverMessage = field('message');

  switch (error.status) {
    case 0:
    case 502:
    case 503:
    case 504:
      return new OrderError('Cannot reach the trading service. Your order was not placed.', error.status, errorCode);
    case 401:
      return new OrderError('Your session has expired. Please sign in again.', 401, errorCode);
    case 400:
      return errorCode === 'ORD-400'
        ? new OrderError("You don't have enough cash for this order.", 400, errorCode)
        : new OrderError('Please check the order details and try again.', 400, errorCode);
    case 403:
      return new OrderError("Your account isn't active, so orders can't be placed.", 403, errorCode);
    case 404:
      return new OrderError("This instrument isn't available to trade right now.", 404, errorCode);
    case 409:
      if (/holding/i.test(serverMessage)) {
        return new OrderError("You don't hold enough of this instrument to sell that many.", 409, errorCode);
      }
      if (/duplicate/i.test(serverMessage)) {
        return new OrderError('This order was already placed.', 409, errorCode);
      }
      if (errorCode === 'ACC-409') {
        return new OrderError("This trading account isn't linked to your login.", 409, errorCode);
      }
      return new OrderError('The order could not be placed. Please try again.', 409, errorCode);
    case 422:
      return new OrderError(
        serverMessage && serverMessage !== 'Invalid input'
          ? `Please check the order: ${serverMessage}`
          : 'Please check the quantity and price, then try again.',
        422,
        errorCode,
      );
    default:
      return new OrderError(
        `The trading service had a problem placing your ${side === 'BUY' ? 'buy' : 'sell'} order. Please try again.`,
        error.status,
        errorCode,
      );
  }
}
