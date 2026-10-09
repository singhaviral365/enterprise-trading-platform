import { Component, computed, inject, output, resource, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';

import { OrderSide as TradeOrderSide } from '../../../api/generated/trade';
import { OrderSide, Strategy, TriggerDirection } from '../../../api/generated/strategies';
import { describeError } from '../../../core/errors/describe-error';
import { FormatPreferences } from '../../../core/format-preferences';
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
  /** Empty means "let the platform work it out". */
  maxOrderValue: string;
  /** Empty means "let the platform work it out". */
  maxPosition: string;
  maxExecutions: string;
  /** A calendar date (yyyy-mm-dd) or empty for "no end date". */
  validUntil: string;
}

/** The platform's own ceilings, repeated here so the form can say so before the server does. */
const MAX_QUANTITY = 1_000_000;
const MAX_ORDER_VALUE = 10_000_000;
const MAX_POSITION = 10_000_000;
const MAX_TRIGGER = 1_000_000_000;
const MAX_WINDOW_DAYS = 366;
/** Mirrors `strategy.limits.default-buffer-percent` in the order-service, which stays the authority. */
const DEFAULT_BUFFER = 1.15;

const WHOLE_NUMBER = /^\d+$/;
const PRICE = /^\d+(\.\d{1,4})?$/;
const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * Creates one strategy from five inputs: the instrument, buy or sell, which way the price has to move, the price level and
 * the quantity. A live sentence under them says what the rule will do, how many times, and the worst case it can spend.
 *
 * A strategy that trades while nobody is watching must have its damage bounded, but the customer is not asked to invent the
 * bounds: the spending cap and the largest holding are worked out by the platform when they are left empty, and "More options"
 * shows them as "auto" values that can be overwritten, together with how many times it may repeat and an end date.
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
  private readonly formats = inject(FormatPreferences);

  /** The new strategy, once it exists. */
  readonly created = output<Strategy>();
  readonly cancelled = output<void>();

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
    validUntil: '',
  });

  protected readonly strategy = form(this.model, (path) => {
    validate(path.trigger, ({ value }) => {
      const raw = value().replace(/,/g, '').trim();
      if (!raw) {
        return { kind: 'required', message: 'Enter the price to watch for.' };
      }
      if (!PRICE.test(raw) || Number(raw) <= 0) {
        return { kind: 'price', message: 'Enter a price above 0 with up to 4 decimal places.' };
      }
      return Number(raw) > MAX_TRIGGER ? { kind: 'price', message: 'That price is too large.' } : undefined;
    });

    validate(path.quantity, ({ value }) => {
      const raw = value().trim();
      if (!raw) {
        return { kind: 'required', message: 'Enter a quantity.' };
      }
      if (!WHOLE_NUMBER.test(raw) || Number(raw) < 1) {
        return { kind: 'quantity', message: 'Quantity must be a whole number of at least 1.' };
      }
      return Number(raw) > MAX_QUANTITY
        ? { kind: 'quantity', message: `Quantity can be at most ${MAX_QUANTITY.toLocaleString('en-US')}.` }
        : undefined;
    });

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
    return WHOLE_NUMBER.test(raw) && Number(raw) >= 1 ? Number(raw) : null;
  });
  private readonly triggerValue = computed(() => {
    const raw = this.model().trigger.replace(/,/g, '').trim();
    const value = Number(raw);
    return PRICE.test(raw) && value > 0 ? value : null;
  });
  private readonly executionsValue = computed(() => {
    const raw = this.model().maxExecutions.trim();
    return WHOLE_NUMBER.test(raw) && Number(raw) >= 1 && Number(raw) <= 20 ? Number(raw) : 1;
  });

  /** What the order would cost at the trigger, in the instrument's currency. */
  private readonly costAtTrigger = computed(() => {
    const quantity = this.quantityValue();
    const trigger = this.triggerValue();
    return quantity !== null && trigger !== null ? quantity * trigger : null;
  });

  /**
   * The spending cap the platform will use, in the account's currency: the customer's own number when one is typed, otherwise
   * the cost at the trigger plus the buffer rounded up, as the order-service works it out. Null while it cannot be known
   * (nothing to price yet, or no rate to convert with).
   */
  protected readonly spendingCap = computed(() => {
    const own = this.model().maxOrderValue.replace(/,/g, '').trim();
    if (own !== '' && MONEY.test(own) && Number(own) > 0) {
      return Number(own);
    }
    return this.autoSpendingCap();
  });

  /** What "auto" means for the spending cap, shown in the field as a placeholder. */
  protected readonly autoSpendingCap = computed(() => {
    const cost = this.costAtTrigger();
    if (cost === null) {
      return null;
    }
    const quoted = this.currency();
    const account = this.store.accountCurrency();
    const inAccount =
      quoted && account && quoted !== account ? convertCurrency(this.market.fxRates(), cost, quoted, account) : cost;
    return inAccount === null ? null : Math.min(MAX_ORDER_VALUE, Math.max(1, Math.ceil(inAccount * DEFAULT_BUFFER)));
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

  /** The rule in words, as the live summary says it. Empty until the five inputs make a rule. */
  protected readonly summary = computed(() => {
    const quantity = this.quantityValue();
    const trigger = this.triggerValue();
    const symbol = this.symbol();
    if (symbol === '' || quantity === null || trigger === null) {
      return '';
    }
    const buying = this.tradeSide() === TradeOrderSide.Buy;
    const way = this.direction() === TriggerDirection.Below ? 'falls to' : 'rises to';
    const level = this.money(trigger, this.currency(), 2, 4);
    const runs = this.executionsValue();
    const cap = this.spendingCap();
    const account = this.store.accountCurrency();

    const parts = [
      `${buying ? 'Buy' : 'Sell'} ${quantity.toLocaleString('en-US')} ${symbol} when the price ${way} ${level}.`,
      runs === 1 ? 'Runs once.' : `Runs up to ${runs} times, each time the price crosses the level again.`,
    ];
    if (cap !== null) {
      const amount = this.money(cap, account, 0, 2);
      parts.push(
        `${buying ? 'Worst case about' : 'The order is capped at about'} ${amount}${runs === 1 ? '' : ' per order'} (the order is placed at the market price, so it can differ).`,
      );
    }
    return parts.join(' ');
  });

  protected readonly canSubmit = computed(
    () =>
      this.symbol() !== '' &&
      !this.strategy().invalid() &&
      !this.strategy().submitting() &&
      !this.alreadyReached() &&
      this.store.accountId() !== null,
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    if (!this.canSubmit()) {
      return;
    }
    await submit(this.strategy, async () => {
      const values = this.model();
      const end = values.validUntil.trim() ? endOfDay(values.validUntil.trim()) : null;
      const maxOrderValue = values.maxOrderValue.replace(/,/g, '').trim();
      const maxPosition = values.maxPosition.trim();
      try {
        const created = await this.store.create({
          symbol: this.symbol(),
          side: this.tradeSide() === TradeOrderSide.Buy ? OrderSide.Buy : OrderSide.Sell,
          quantity: Number(values.quantity.trim()),
          direction: this.direction(),
          triggerPrice: Number(values.trigger.replace(/,/g, '').trim()),
          ...(maxOrderValue ? { maxOrderValue: Number(maxOrderValue) } : {}),
          ...(maxPosition ? { maxPositionQty: Number(maxPosition) } : {}),
          maxExecutions: Number(values.maxExecutions.trim()),
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

  private money(value: number, currency: string | null | undefined, minimumFractionDigits: number, maximumFractionDigits: number): string {
    const digits = { minimumFractionDigits, maximumFractionDigits };
    if (!currency) {
      return value.toLocaleString(this.formats.locale(), digits);
    }
    return new Intl.NumberFormat(this.formats.locale(), { style: 'currency', currency, ...digits }).format(value);
  }
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
