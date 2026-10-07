import { Component, computed, inject, output, resource, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';

import { OrderSide as TradeOrderSide } from '../../../api/generated/trade';
import { OrderSide, Strategy, TriggerDirection } from '../../../api/generated/strategies';
import { describeError } from '../../../core/errors/describe-error';
import { convertCurrency, MarketService } from '../../../core/market.service';
import { NotificationService } from '../../../core/notification.service';
import { StrategiesStore } from '../../../core/strategies.store';
import { PreferenceCurrencyPipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';
import { Dropdown, DropdownOption } from '../../../shared/ui/dropdown/dropdown';
import { SideToggle } from '../../../shared/ui/side-toggle/side-toggle';
import { Spinner } from '../../../shared/ui/spinner/spinner';

interface StrategyModel {
  trigger: string;
  quantity: string;
  maxOrderValue: string;
  maxPosition: string;
  maxExecutions: string;
  maxFailures: string;
  /** A calendar date (yyyy-mm-dd) or empty for "no end date". */
  validUntil: string;
}

/** The platform's own ceilings, repeated here so the form can say so before the server does. */
const MAX_QUANTITY = 1_000_000;
const MAX_ORDER_VALUE = 10_000_000;
const MAX_POSITION = 10_000_000;
const MAX_TRIGGER = 1_000_000_000;
const MAX_WINDOW_DAYS = 366;

const WHOLE_NUMBER = /^\d+$/;
const PRICE = /^\d+(\.\d{1,4})?$/;
const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * Creates one strategy: the rule (instrument, buy or sell, the price level to watch, how many), the limits that bound what
 * it may do unattended, and an optional end date. The limits are required, not defaulted: a strategy that trades while
 * nobody is watching must have had its damage bounded by a decision somebody made, and the form helps with that by showing
 * what the order would cost at the trigger.
 *
 * Nothing is placed from here. This only creates the rule; the platform trades it later, through the ordinary order route.
 */
@Component({
  selector: 'app-strategy-form',
  imports: [Dropdown, FormField, PreferenceCurrencyPipe, PreferenceDecimalPipe, SideToggle, Spinner],
  templateUrl: './strategy-form.html',
  styleUrl: './strategy-form.css',
})
export class StrategyForm {
  private readonly store = inject(StrategiesStore);
  private readonly market = inject(MarketService);
  private readonly notifications = inject(NotificationService);

  /** The new strategy, once it exists. */
  readonly created = output<Strategy>();
  readonly cancelled = output<void>();

  protected readonly maxQuantity = MAX_QUANTITY;

  /** Instruments and their latest price, from the same board the market page shows. */
  protected readonly board = resource({ loader: () => this.market.getBoard() });

  protected readonly symbol = signal('');
  protected readonly tradeSide = signal<TradeOrderSide>(TradeOrderSide.Buy);
  protected readonly direction = signal<TriggerDirection>(TriggerDirection.Below);
  protected readonly serverError = signal('');

  protected readonly directionOptions: readonly DropdownOption[] = [
    { value: TriggerDirection.Below, label: 'Falls to or below' },
    { value: TriggerDirection.Above, label: 'Rises to or above' },
  ];

  protected readonly model = signal<StrategyModel>({
    trigger: '',
    quantity: '1',
    maxOrderValue: '',
    maxPosition: '',
    maxExecutions: '1',
    maxFailures: '3',
    validUntil: '',
  });

  protected readonly strategy = form(this.model, (path) => {
    required(path.trigger, { message: 'Enter the price to watch for.' });
    validate(path.trigger, ({ value }) => {
      const raw = value().replace(/,/g, '').trim();
      if (!raw) {
        return undefined;
      }
      if (!PRICE.test(raw) || Number(raw) <= 0) {
        return { kind: 'price', message: 'Enter a price above 0 with up to 4 decimal places.' };
      }
      return Number(raw) > MAX_TRIGGER ? { kind: 'price', message: 'That price is too large.' } : undefined;
    });

    required(path.quantity, { message: 'Enter a quantity.' });
    validate(path.quantity, ({ value }) => {
      const raw = value().trim();
      if (!raw) {
        return undefined;
      }
      if (!WHOLE_NUMBER.test(raw) || Number(raw) < 1) {
        return { kind: 'quantity', message: 'Quantity must be a whole number of at least 1.' };
      }
      return Number(raw) > MAX_QUANTITY
        ? { kind: 'quantity', message: `Quantity can be at most ${MAX_QUANTITY.toLocaleString('en-US')}.` }
        : undefined;
    });

    required(path.maxOrderValue, { message: 'Set the most one order may cost.' });
    validate(path.maxOrderValue, ({ value }) => {
      const raw = value().replace(/,/g, '').trim();
      if (!raw) {
        return undefined;
      }
      if (!MONEY.test(raw) || Number(raw) <= 0) {
        return { kind: 'money', message: 'Enter an amount above 0 with up to 2 decimal places.' };
      }
      return Number(raw) > MAX_ORDER_VALUE
        ? { kind: 'money', message: `The most one order may cost is ${MAX_ORDER_VALUE.toLocaleString('en-US')}.` }
        : undefined;
    });

    required(path.maxPosition, { message: 'Set the largest holding it may build.' });
    validate(path.maxPosition, ({ value }) => {
      const raw = value().trim();
      if (!raw) {
        return undefined;
      }
      if (!WHOLE_NUMBER.test(raw) || Number(raw) < 1) {
        return { kind: 'position', message: 'Enter a whole number of at least 1.' };
      }
      if (Number(raw) > MAX_POSITION) {
        return { kind: 'position', message: `The largest holding is ${MAX_POSITION.toLocaleString('en-US')} units.` };
      }
      const quantity = this.quantityValue();
      return this.tradeSide() === TradeOrderSide.Buy && quantity !== null && Number(raw) < quantity
        ? { kind: 'position', message: 'This must be at least the quantity you are buying.' }
        : undefined;
    });

    validate(path.maxExecutions, ({ value }) => {
      const raw = value().trim();
      return WHOLE_NUMBER.test(raw) && Number(raw) >= 1 && Number(raw) <= 20
        ? undefined
        : { kind: 'executions', message: 'Enter a whole number from 1 to 20.' };
    });
    validate(path.maxFailures, ({ value }) => {
      const raw = value().trim();
      return WHOLE_NUMBER.test(raw) && Number(raw) >= 1 && Number(raw) <= 10
        ? undefined
        : { kind: 'failures', message: 'Enter a whole number from 1 to 10.' };
    });

    validate(path.validUntil, ({ value }) => {
      const raw = value().trim();
      if (!raw) {
        return undefined;
      }
      const end = endOfDay(raw);
      if (end === null) {
        return { kind: 'date', message: 'Enter a valid date.' };
      }
      if (end.getTime() <= Date.now()) {
        return { kind: 'date', message: 'The end date must be in the future.' };
      }
      return end.getTime() > Date.now() + MAX_WINDOW_DAYS * 86_400_000
        ? { kind: 'date', message: `The end date can be at most ${MAX_WINDOW_DAYS} days ahead.` }
        : undefined;
    });
  });

  protected readonly instrumentOptions = computed<readonly DropdownOption[]>(() =>
    this.board.hasValue()
      ? this.board
          .value()
          .quotes.filter((quote) => quote.price !== null)
          .map((quote) => ({ value: quote.symbol, label: quote.name ? `${quote.symbol}, ${quote.name}` : quote.symbol }))
      : [],
  );

  protected readonly selected = computed(() =>
    this.board.hasValue() ? (this.board.value().quotes.find((quote) => quote.symbol === this.symbol()) ?? null) : null,
  );
  /** The instrument's latest price and the currency it is quoted in. */
  protected readonly nowPrice = computed(() => this.selected()?.price ?? null);
  protected readonly currency = computed(() => this.selected()?.currency ?? null);

  private readonly quantityValue = computed(() => {
    const raw = this.model().quantity.trim();
    return WHOLE_NUMBER.test(raw) ? Number(raw) : null;
  });
  private readonly triggerValue = computed(() => {
    const raw = this.model().trigger.replace(/,/g, '').trim();
    const value = Number(raw);
    return PRICE.test(raw) && value > 0 ? value : null;
  });

  /** What the order would cost at the trigger, in the instrument's currency. */
  protected readonly costAtTrigger = computed(() => {
    const quantity = this.quantityValue();
    const trigger = this.triggerValue();
    return quantity !== null && trigger !== null ? quantity * trigger : null;
  });

  /**
   * A starting point for the order limit: the cost at the trigger plus a tenth, rounded up, in the account's currency
   * when the board has the rate to convert (the limit is checked in the account's currency).
   */
  protected readonly suggestedOrderLimit = computed(() => {
    const cost = this.costAtTrigger();
    if (cost === null) {
      return null;
    }
    const quoted = this.currency();
    const account = this.store.accountCurrency();
    const inAccount = quoted && account && quoted !== account ? convertCurrency(this.market.fxRates(), cost, quoted, account) : cost;
    return inAccount === null ? null : Math.ceil(inAccount * 1.1);
  });

  /** The price has already reached the trigger, so the strategy would be refused: say so before the server does. */
  protected readonly alreadyReached = computed(() => {
    const price = this.nowPrice();
    const trigger = this.triggerValue();
    if (price === null || trigger === null) {
      return false;
    }
    return this.direction() === TriggerDirection.Below ? price <= trigger : price >= trigger;
  });

  protected readonly canSubmit = computed(
    () =>
      this.symbol() !== '' &&
      !this.strategy().invalid() &&
      !this.strategy().submitting() &&
      !this.alreadyReached() &&
      this.store.accountId() !== null,
  );

  protected useSuggestedLimit(): void {
    const suggestion = this.suggestedOrderLimit();
    if (suggestion !== null) {
      this.strategy.maxOrderValue().value.set(String(suggestion));
    }
  }

  /** The position limit most people want: the quantity itself, or what they already hold plus it. */
  protected useQuantityAsPosition(): void {
    const quantity = this.quantityValue();
    if (quantity !== null) {
      this.strategy.maxPosition().value.set(String(quantity));
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    if (!this.canSubmit()) {
      return;
    }
    await submit(this.strategy, async () => {
      const values = this.model();
      const end = values.validUntil.trim() ? endOfDay(values.validUntil.trim()) : null;
      try {
        const created = await this.store.create({
          symbol: this.symbol(),
          side: this.tradeSide() === TradeOrderSide.Buy ? OrderSide.Buy : OrderSide.Sell,
          quantity: Number(values.quantity.trim()),
          direction: this.direction(),
          triggerPrice: Number(values.trigger.replace(/,/g, '').trim()),
          maxOrderValue: Number(values.maxOrderValue.replace(/,/g, '').trim()),
          maxPositionQty: Number(values.maxPosition.trim()),
          maxExecutions: Number(values.maxExecutions.trim()),
          maxFailures: Number(values.maxFailures.trim()),
          ...(end ? { validUntil: end.toISOString() } : {}),
        });
        this.notifications.success(`Strategy #${created.strategyId} is watching ${created.symbol}.`);
        this.created.emit(created);
      } catch (error) {
        this.serverError.set(describeError(error));
      }
    });
  }

  protected readonly TradeOrderSide = TradeOrderSide;
}

/** The last moment of a calendar day (yyyy-mm-dd) in the customer's own time zone, or null if it is not a date. */
function endOfDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 23, 59, 59);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
