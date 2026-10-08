import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { CreateAccountRequest, CreateAccountRequestCurrencyEnum } from '../../../api/generated/trade';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthService } from '../../../core/auth.service';
import { describeError } from '../../../core/errors/describe-error';
import { CURRENCY_OPTIONS } from '../../../core/preferences';
import { Dropdown } from '../../../shared/ui/dropdown/dropdown';
import { Spinner } from '../../../shared/ui/spinner/spinner';

interface AccountSetupModel {
  clientName: string;
  phoneNo: string;
  email: string;
  dob: string;
  balance: string;
  /** The account currency, chosen once. */
  currency: string;
}

/**
 * Smallest (and default) opening balance for each currency, mirrored from the Trade API's configuration
 * (`account.opening.minimum.*`). 20,000 is a dollar-sized number, so each currency has its own; the server remains the authority.
 */
export const OPENING_BALANCE_MINIMUMS: Readonly<Record<string, number>> = {
  USD: 20000,
  EUR: 18000,
  GBP: 16000,
  INR: 1600000,
  JPY: 3000000,
  CAD: 27000,
  AUD: 30000,
  CHF: 17000,
  SGD: 27000,
  CNY: 145000,
};

/** The narrow symbol shown in front of the opening balance. */
export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  CHF: 'CHF',
  SGD: 'S$',
  CNY: 'CN¥',
};

export const DEFAULT_CURRENCY = 'USD';

/** The smallest opening balance in a currency. */
export function minimumOpeningBalance(currency: string): number {
  return OPENING_BALANCE_MINIMUMS[currency] ?? OPENING_BALANCE_MINIMUMS[DEFAULT_CURRENCY];
}

/**
 * Collects the details for `POST /accounts/create` (CreateAccountRequest in the Trade API) and opens
 * the trading account linked to the signed-in user. Emits `completed` once the user has an account.
 */
@Component({
  selector: 'app-account-setup-form',
  imports: [Dropdown, FormField, Spinner],
  templateUrl: './account-setup-form.html',
  styleUrl: '../auth-form.css',
})
export class AccountSetupForm implements OnInit {
  private readonly accounts = inject(AccountOverviewStore);
  private readonly auth = inject(AuthService);

  /** Pre-fills the email field, e.g. with the address just used to register. */
  readonly email = input('');
  readonly completed = output<void>();
  readonly skipped = output<void>();

  protected readonly currencyOptions = CURRENCY_OPTIONS;
  protected readonly model = signal<AccountSetupModel>({
    clientName: '',
    phoneNo: '',
    email: '',
    dob: '',
    balance: '',
    currency: DEFAULT_CURRENCY,
  });
  /** The smallest opening balance in the currency chosen now. */
  protected readonly minBalance = computed(() => minimumOpeningBalance(this.model().currency));
  protected readonly currencySymbol = computed(() => CURRENCY_SYMBOLS[this.model().currency] ?? this.model().currency);
  protected readonly setupForm = form(this.model, (path) => {
    required(path.clientName, { message: 'Enter your full name.' });
    minLength(path.clientName, 2, { message: 'Name must be at least 2 characters.' });
    maxLength(path.clientName, 100, { message: 'Name must be 100 characters or fewer.' });
    required(path.phoneNo, { message: 'Enter your phone number.' });
    pattern(path.phoneNo, /^\+?[0-9\s\-()]{10,20}$/, {
      message: 'Enter 10-20 digits; spaces, dashes, brackets and a leading + are allowed.',
    });
    required(path.email, { message: 'Enter your email address.' });
    email(path.email, { message: 'Enter a valid email address, like name@example.com.' });
    maxLength(path.email, 255, { message: 'Email must be 255 characters or fewer.' });
    validate(path.dob, ({ value }) =>
      value() && value() >= new Date().toISOString().slice(0, 10)
        ? { kind: 'dob', message: 'Date of birth must be in the past.' }
        : undefined,
    );
    validate(path.balance, ({ value }) => {
      const raw = value().replace(/,/g, '').trim();
      if (!raw) {
        return undefined;
      }
      const amount = Number(raw);
      const minimum = minimumOpeningBalance(this.model().currency);
      return Number.isFinite(amount) && amount >= minimum
        ? undefined
        : { kind: 'balance', message: `Opening balance must be a number of at least ${minimum.toLocaleString('en-US')}.` };
    });
  });
  protected readonly serverError = signal('');

  async ngOnInit(): Promise<void> {
    const known = this.email();
    if (known) {
      this.setupForm.email().value.set(known);
      return;
    }
    try {
      const user = await this.auth.me();
      // Registrations without a real address get a "<username>@local.auth" placeholder; don't offer that.
      if (user.email && !user.email.endsWith('@local.auth') && !this.model().email) {
        this.setupForm.email().value.set(user.email);
      }
    } catch {
      // Pre-filling is a convenience; the user can type the address.
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set('');
    await submit(this.setupForm, async () => {
      try {
        await this.accounts.createAccount(this.toRequest());
        this.completed.emit();
      } catch (error) {
        if (error instanceof HttpErrorResponse && error.status === 409) {
          // Already linked (e.g. created in another tab): nothing left to set up.
          this.accounts.reload();
          this.completed.emit();
        } else {
          this.serverError.set(describeError(error));
        }
      }
      return undefined;
    });
  }

  private toRequest(): CreateAccountRequest {
    const { clientName, phoneNo, email: emailAddress, dob, balance, currency } = this.model();
    const amount = balance.replace(/,/g, '').trim();
    return {
      client_name: clientName.trim(),
      phone_no: phoneNo.trim(),
      email: emailAddress.trim(),
      ...(dob ? { dob } : {}),
      currency: currency as CreateAccountRequestCurrencyEnum,
      // Left out when blank so the Trade API applies its default (the minimum for the chosen currency).
      ...(amount ? { balance: Number(amount) } : {}),
    };
  }
}
