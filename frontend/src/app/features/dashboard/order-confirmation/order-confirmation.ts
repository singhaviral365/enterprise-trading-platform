import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { OrderPricingType, OrderResponse, OrderSide } from '../../../api/generated/trade';

/** Shown after an order is accepted by the Trade API: order number, status and what was sent. */
@Component({
  selector: 'app-order-confirmation',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './order-confirmation.html',
  styleUrl: './order-confirmation.css',
})
export class OrderConfirmation {
  protected readonly OrderSide = OrderSide;
  protected readonly OrderPricingType = OrderPricingType;

  readonly order = input.required<OrderResponse>();
  /** ISO currency code of the instrument, for formatting the price; null shows a plain number. */
  readonly currency = input<string | null>(null);
  readonly another = output<void>();
  readonly done = output<void>();
}
