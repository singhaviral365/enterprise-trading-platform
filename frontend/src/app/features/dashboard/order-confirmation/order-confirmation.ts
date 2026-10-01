import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { OrderPricingType, OrderResponse, OrderSide, OrderStatus } from '../../../api/generated/trade';
import { OrderStatusBadge } from '../../../shared/ui/order-status/order-status';

/** Shown after an order is accepted by the Trade API: order number, status and what was sent. */
@Component({
  selector: 'app-order-confirmation',
  imports: [CurrencyPipe, DecimalPipe, OrderStatusBadge],
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

  /** What the status means for the user; it changes as the order moves from working to filled. */
  protected readonly explanation = computed(() => {
    const order = this.order();
    switch (order.status) {
      case OrderStatus.Filled:
        return 'Your order has been filled.';
      case OrderStatus.Rejected:
        return 'Your order was rejected. Check your orders for details.';
      case OrderStatus.Cancelled:
        return 'Your order was cancelled.';
      default:
        return order.orderPricingType === OrderPricingType.Market
          ? 'It will be filled at the live market price.'
          : 'It will be filled when the price reaches your limit.';
    }
  });
}
