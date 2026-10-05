import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
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
import { CreateAccountRequest } from '../../../api/generated/trade';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthService } from '../../../core/auth.service';
import { describeError } from '../../../core/errors/describe-error';
import { Spinner } from '../../../shared/ui/spinner/spinner';

interface AccountSetupModel {
  clientName: string;
  phoneNo: string;
  email: string;
  dob: string;
  balance: string;
}

/** Minimum (and default) opening balance enforced by the Trade API. */
export const MIN_OPENING_BALANCE = 20000;

/**
 * Collects the details for `POST /accounts/create` (CreateAccountRequest in the Trade API) and opens
 * the trading account linked to the signed-in user. Emits `completed` once the user has an account.
 */
@Component({
  selector: 'app-account-setup-form',
  imports: [FormField, Spinner],
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

  protected readonly minBalance = MIN_OPENING_BALANCE;
  protected readonly model = signal<AccountSetupModel>({
    clientName: '',
    phoneNo: '',
    email: '',
    dob: '',
    balance: '',
  });
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
      return Number.isFinite(amount) && amount >= MIN_OPENING_BALANCE
        ? undefined
        : { kind: 'balance', message: `Opening balance must be a number of at least ${MIN_OPENING_BALANCE.toLocaleString('en-US')}.` };
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
    const { clientName, phoneNo, email: emailAddress, dob, balance } = this.model();
    const amount = balance.replace(/,/g, '').trim();
    return {
      client_name: clientName.trim(),
      phone_no: phoneNo.trim(),
      email: emailAddress.trim(),
      ...(dob ? { dob } : {}),
      // Left out when blank so the Trade API applies its default opening balance.
      ...(amount ? { balance: Number(amount) } : {}),
    };
  }
}
