import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AccountStatus, OrderPricingType, OrderResponse, OrderSide } from '../../../api/generated/trade';
import { TradeApi } from '../../../api/trade-api.service';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { describeError } from '../../../core/errors/describe-error';
import { newIdempotencyKey } from '../../../core/idempotency-key';
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
 * price and fill at the live price; LIMIT orders need a limit price. Submits through the generated Trade client
 * (`POST /api/v1/orders`), then shows the placed order.
 */
@Component({
  selector: 'app-order-ticket',
  imports: [CurrencyPipe, DecimalPipe, FormField, OrderConfirmation, SideToggle, Spinner],
  templateUrl: './order-ticket.html',
  styleUrl: './order-ticket.css',
})
export class OrderTicket {
  private readonly trade = inject(TradeApi);
  private readonly authDialog = inject(AuthDialogService);
  protected readonly store = inject(AccountOverviewStore);

  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly OrderSide = OrderSide;
  protected readonly OrderPricingType = OrderPricingType;

  /** The instrument being traded. */
  readonly row = input.required<MarketRow>();
  /** Buy or sell; two-way bound so the dialog can open the ticket on either side. */
  readonly side = model<OrderSide>(OrderSide.Buy);
  /** "Back" from the ticket to the quote view. */
  readonly cancelled = output<void>();
  /** The user dismissed the confirmation of a placed order. */
  readonly done = output<OrderResponse>();

  protected readonly orderType = signal<OrderPricingType>(OrderPricingType.Market);
  protected readonly placed = signal<OrderResponse | null>(null);
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
      if (this.orderType() !== OrderPricingType.Limit) {
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
  protected readonly accountActive = computed(() => this.account()?.overview.account.status === AccountStatus.Active);
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
  /** The stepper stays inside 1..MAX_QUANTITY; text that is not a number counts as 0, so plus gives 1. */
  protected readonly canDecrease = computed(() => (this.quantityValue() ?? 0) > 1);
  protected readonly canIncrease = computed(() => (this.quantityValue() ?? 0) < MAX_QUANTITY);

  protected stepQuantity(delta: 1 | -1): void {
    const next = Math.min(MAX_QUANTITY, Math.max(1, (this.quantityValue() ?? 0) + delta));
    this.ticket.quantity().value.set(String(next));
  }

  /** Arrow keys step the quantity like a number input, without moving the caret. */
  protected onQuantityArrow(event: Event, delta: 1 | -1): void {
    event.preventDefault();
    this.stepQuantity(delta);
  }

  private readonly limitValue = computed(() => {
    const raw = this.model().limitPrice.replace(/,/g, '').trim();
    const value = Number(raw);
    return raw && Number.isFinite(value) && value > 0 ? value : null;
  });
  /** Price the estimate uses: the limit for LIMIT orders, the live price for MARKET orders. */
  protected readonly unitPrice = computed(() =>
    this.orderType() === OrderPricingType.Limit ? this.limitValue() : this.row().quote.price,
  );
  protected readonly estimate = computed(() => {
    const quantity = this.quantityValue();
    const price = this.unitPrice();
    return quantity !== null && price !== null ? quantity * price : null;
  });
  /** A buy that costs more than the available cash can only be rejected. */
  protected readonly insufficientCash = computed(() => {
    const estimate = this.estimate();
    const cash = this.cash();
    return this.side() === OrderSide.Buy && estimate !== null && cash !== null && estimate > cash;
  });
  /** Selling more than is held can only be rejected. */
  protected readonly exceedsHolding = computed(() => {
    const quantity = this.quantityValue();
    return this.side() === OrderSide.Sell && quantity !== null && quantity > this.held();
  });
  /** A market order needs a live quote to fill at; without one there is nothing to price it with. */
  protected readonly noLivePrice = computed(
    () => this.orderType() === OrderPricingType.Market && this.row().quote.price === null,
  );
  /**
   * Every condition the form can foresee as a certain rejection. Each one shows a reason below and keeps
   * Place order disabled; the Trade API still has the final say on everything else.
   */
  protected readonly warning = computed(() => {
    if (this.noLivePrice()) {
      return "There is no live price for this instrument right now, so a market order can't be placed.";
    }
    if (this.insufficientCash()) {
      return "This is more than your available cash, so the order can't be placed.";
    }
    if (this.exceedsHolding()) {
      return this.held() === 0
        ? "You don't hold this instrument, so there is nothing to sell."
        : `You hold ${this.held().toLocaleString('en-US')}, so you can't sell more than that.`;
    }
    return '';
  });
  /** Place order is enabled only when nothing above (or in the fields) rules the order out. */
  protected readonly canSubmit = computed(
    () =>
      !this.ticket().invalid() &&
      !this.ticket().submitting() &&
      !!this.account() &&
      this.accountActive() &&
      !this.warning(),
  );
  /**
   * The placed order with its status kept current: the store re-reads the account while anything is at
   * NEW, so the confirmation moves from "Working" to "Filled" (or "Rejected") without a reload.
   */
  protected readonly liveOrder = computed(() => {
    const placed = this.placed();
    if (!placed) {
      return null;
    }
    const latest = this.store.linked()?.overview.orders.find((order) => order.orderId === placed.orderId);
    return latest ? { ...placed, status: latest.status } : placed;
  });

  protected setOrderType(type: OrderPricingType): void {
    this.orderType.set(type);
    this.serverError.set('');
    // Start a limit order at the live price so the user only has to adjust it.
    const price = this.row().quote.price;
    if (type === OrderPricingType.Limit && !this.model().limitPrice && price !== null) {
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
    if (!account || !this.canSubmit()) {
      return;
    }
    await submit(this.ticket, async () => {
      const limit = this.limitValue();
      try {
        const placed = await firstValueFrom(
          this.trade.placeOrder({
            accountId: account.overview.account.id,
            symbol: this.row().quote.symbol,
            side: this.side(),
            orderPricingType: this.orderType(),
            quantity: this.quantityValue() ?? 0,
            ...(this.orderType() === OrderPricingType.Limit && limit !== null ? { price: limit } : {}),
            idempotencyKey: this.idempotencyKey,
          }),
        );
        this.placed.set(placed);
        this.idempotencyKey = newIdempotencyKey();
        // Refresh balances and orders now, and keep re-reading while the order is working.
        this.store.refresh();
      } catch (error) {
        this.serverError.set(describeError(error));
      }
      return undefined;
    });
  }

  protected placeAnother(): void {
    this.placed.set(null);
    this.serverError.set('');
    this.model.set({ quantity: '1', limitPrice: '' });
    this.ticket().reset();
    this.orderType.set(OrderPricingType.Market);
  }
}
