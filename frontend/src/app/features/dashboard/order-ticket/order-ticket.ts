import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import {
  OrderError,
  OrderPricingType,
  OrderService,
  OrderSide,
  PlacedOrder,
  newIdempotencyKey,
} from '../../../core/order.service';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import type { MarketRow } from '../market-board/market-board';
import { OrderConfirmation } from '../order-confirmation/order-confirmation';
import { SideToggle } from '../side-toggle/side-toggle';

interface TicketModel {
  quantity: string;
  limitPrice: string;
}

const MAX_QUANTITY = 1_000_000;

/**
 * Order entry for one instrument, shown inside the quote dialog. MARKET orders go in without a
 * price and fill at the live price; LIMIT orders need a limit price. Submits to the Trade API's
 * `POST /orders`, then shows the placed order.
 */
@Component({
  selector: 'app-order-ticket',
  imports: [CurrencyPipe, DecimalPipe, FormField, OrderConfirmation, SideToggle, Spinner],
  templateUrl: './order-ticket.html',
  styleUrl: './order-ticket.css',
})
export class OrderTicket {
  private readonly orders = inject(OrderService);
  private readonly authDialog = inject(AuthDialogService);
  protected readonly store = inject(AccountOverviewStore);

  /** The instrument being traded. */
  readonly row = input.required<MarketRow>();
  /** Buy or sell; two-way bound so the dialog can open the ticket on either side. */
  readonly side = model<OrderSide>('BUY');
  /** "Back" from the ticket to the quote view. */
  readonly cancelled = output<void>();
  /** The user dismissed the confirmation of a placed order. */
  readonly done = output<PlacedOrder>();

  protected readonly orderType = signal<OrderPricingType>('MARKET');
  protected readonly placed = signal<PlacedOrder | null>(null);
  protected readonly serverError = signal('');
  /** One key per order attempt, so a retry after a network error cannot create a second order. */
  private idempotencyKey = newIdempotencyKey();

  protected readonly model = signal<TicketModel>({ quantity: '1', limitPrice: '' });
  protected readonly ticket = form(this.model, (path) => {
    required(path.quantity, { message: 'Enter a quantity.' });
    validate(path.quantity, ({ value }) => {
      const raw = value().trim();
      if (!raw) {
        return undefined;
      }
      if (!/^\d+$/.test(raw) || Number(raw) < 1) {
        return { kind: 'quantity', message: 'Quantity must be a whole number of at least 1.' };
      }
      return Number(raw) > MAX_QUANTITY
        ? { kind: 'quantity', message: `Quantity can be at most ${MAX_QUANTITY.toLocaleString('en-US')}.` }
        : undefined;
    });
    validate(path.limitPrice, ({ value }) => {
      if (this.orderType() !== 'LIMIT') {
        return undefined;
      }
      const raw = value().replace(/,/g, '').trim();
      if (!raw) {
        return { kind: 'required', message: 'Enter a limit price.' };
      }
      return /^\d+(\.\d{1,4})?$/.test(raw) && Number(raw) > 0
        ? undefined
        : { kind: 'price', message: 'Enter a price above 0 with up to 4 decimal places.' };
    });
  });

  /** The linked account (null while loading or when the user has none). */
  protected readonly account = computed(() => this.store.linked());
  protected readonly accountActive = computed(() => this.account()?.overview.account.status === 'ACTIVE');
  protected readonly cash = computed(() => this.account()?.overview.balance.cashBalance ?? null);
  protected readonly accountCurrency = computed(() => this.account()?.overview.balance.currency ?? null);
  /** How much of this instrument the user holds (for sells). */
  protected readonly held = computed(
    () => this.account()?.overview.positions.find((p) => p.symbol === this.row().quote.symbol)?.quantity ?? 0,
  );

  private readonly quantityValue = computed(() => {
    const raw = this.model().quantity.trim();
    return /^\d+$/.test(raw) ? Number(raw) : null;
  });
  private readonly limitValue = computed(() => {
    const raw = this.model().limitPrice.replace(/,/g, '').trim();
    const value = Number(raw);
    return raw && Number.isFinite(value) && value > 0 ? value : null;
  });
  /** Price the estimate uses: the limit for LIMIT orders, the live price for MARKET orders. */
  protected readonly unitPrice = computed(() =>
    this.orderType() === 'LIMIT' ? this.limitValue() : this.row().quote.price,
  );
  protected readonly estimate = computed(() => {
    const quantity = this.quantityValue();
    const price = this.unitPrice();
    return quantity !== null && price !== null ? quantity * price : null;
  });
  /** Soft warnings: the Trade API / executor have the final say. */
  protected readonly warning = computed(() => {
    const estimate = this.estimate();
    const cash = this.cash();
    if (this.side() === 'BUY' && estimate !== null && cash !== null && estimate > cash) {
      return 'This is more than your available cash, so the order may be rejected.';
    }
    const quantity = this.quantityValue();
    if (this.side() === 'SELL' && quantity !== null && quantity > this.held()) {
      return this.held() === 0
        ? "You don't hold this instrument yet, so a sell order may be rejected."
        : `You hold ${this.held().toLocaleString('en-US')}, so selling more may be rejected.`;
    }
    return '';
  });

  protected setOrderType(type: OrderPricingType): void {
    this.orderType.set(type);
    this.serverError.set('');
    // Start a limit order at the live price so the user only has to adjust it.
    const price = this.row().quote.price;
    if (type === 'LIMIT' && !this.model().limitPrice && price !== null) {
      this.ticket.limitPrice().value.set(price.toFixed(2));
    }
  }

  protected openAccountSetup(): void {
    this.authDialog.open('account');
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    const account = this.account();
    if (!account || !this.accountActive()) {
      return;
    }
    await submit(this.ticket, async () => {
      const limit = this.limitValue();
      try {
        const placed = await this.orders.placeOrder({
          accountId: account.overview.account.id,
          symbol: this.row().quote.symbol,
          side: this.side(),
          orderPricingType: this.orderType(),
          quantity: this.quantityValue() ?? 0,
          ...(this.orderType() === 'LIMIT' && limit !== null ? { price: limit } : {}),
          idempotencyKey: this.idempotencyKey,
        });
        this.placed.set(placed);
        this.idempotencyKey = newIdempotencyKey();
        // Refresh balances and the Recent orders list on the dashboard.
        this.store.reload();
      } catch (error) {
        this.serverError.set(
          error instanceof OrderError ? error.message : 'Something went wrong placing your order. Please try again.',
        );
      }
      return undefined;
    });
  }

  protected placeAnother(): void {
    this.placed.set(null);
    this.serverError.set('');
    this.model.set({ quantity: '1', limitPrice: '' });
    this.ticket().reset();
    this.orderType.set('MARKET');
  }
}
