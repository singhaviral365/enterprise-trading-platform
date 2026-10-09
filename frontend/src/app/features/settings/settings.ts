import { NgTemplateOutlet } from '@angular/common';
import { formatCurrency, formatDate, formatNumber } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/errors/describe-error';
import { NotificationService } from '../../core/notification.service';
import {
  CATEGORY_OPTIONS,
  CHANNEL_OPTIONS,
  DATE_FORMAT_VALUES,
  LANDING_PAGE_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  ORDER_TYPE_OPTIONS,
  PreferenceValues,
  THEME_OPTIONS,
  TIME_FORMAT_OPTIONS,
  datePattern,
  numberLocale,
  resolveDatePattern,
  samePreferences,
  valuesOf,
  DateFormat,
  Currency,
  LandingPage,
  NotificationCategory,
  NotificationChannel,
  NumberFormat,
  OrderType,
  Theme,
  TimeFormat,
} from '../../core/preferences';
import { PreferencesStore } from '../../core/preferences.store';
import { Dropdown, DropdownOption } from '../../shared/ui/dropdown/dropdown';
import { MultiDropdown } from '../../shared/ui/multi-dropdown/multi-dropdown';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** The "No notifications" chip is not a channel: choosing it empties the list, and an empty list shows it chosen. */
const NO_NOTIFICATIONS = 'NONE';

/** A fixed moment to show formats on, so the preview never changes under the customer's feet. */
const SAMPLE_MOMENT = new Date(2026, 9, 6, 15, 7, 9);
const SAMPLE_AMOUNT = 1234567.891;

/**
 * Settings: where a customer sets how they are alerted, how dates, times and numbers are written (the account currency is
 * shown, read-only: it was chosen when the account was opened), whether the signal assistant appears on each quote, and a few display choices. One form, one Save: the whole
 * document goes to the Trade API in a single `PUT`, and the rest of the app follows it as soon as it is stored.
 *
 * The form edits a draft; nothing changes anywhere else until Save. The preview under "Display" is drawn from the
 * draft, so a format can be judged before it is kept.
 */
@Component({
  selector: 'app-settings',
  imports: [Dropdown, MultiDropdown, NgTemplateOutlet, Spinner],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly store = inject(PreferencesStore);
  protected readonly accounts = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  /** What the form is editing. It starts again from the stored values whenever those change (a load, a save). */
  protected readonly draft = linkedSignal<PreferenceValues>(() => this.store.current());
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  /** Two-step sign-in belongs to the login, not to the trading account, but it is saved with the rest: the choice waits for Save. */
  protected readonly twoFactorOptions: readonly DropdownOption[] = [
    { value: 'on', label: 'On: ask for an emailed code' },
    { value: 'off', label: 'Off' },
  ];
  /** What the server has. Null until it has answered. */
  protected readonly twoFactorEnabled = signal<boolean | null>(null);
  /** The choice made on this screen and not yet saved; null when there is none. */
  private readonly twoFactorDraft = signal<boolean | null>(null);
  protected readonly twoFactorShown = computed<'on' | 'off'>(() => ((this.twoFactorDraft() ?? this.twoFactorEnabled()) === true ? 'on' : 'off'));
  protected readonly twoFactorBusy = signal(false);
  protected readonly twoFactorError = signal('');
  protected readonly twoFactorDirty = computed(() => this.twoFactorDraft() !== null && this.twoFactorDraft() !== this.twoFactorEnabled());

  constructor() {
    void this.loadTwoFactor();
  }

  protected setTwoFactor(value: string): void {
    this.twoFactorDraft.set(value === 'on');
    this.twoFactorError.set('');
    this.saveError.set('');
  }

  private async loadTwoFactor(): Promise<void> {
    try {
      const enabled = (await this.auth.me()).twoFactorEnabled;
      this.twoFactorEnabled.set(enabled);
    } catch (error) {
      this.twoFactorError.set(describeError(error));
    }
  }

  protected readonly dirty = computed(() => !samePreferences(this.draft(), this.store.current()) || this.twoFactorDirty());

  // ---- The options, in the shapes the shared controls take ---------------------------------------------------------

  protected readonly channelOptions: readonly DropdownOption[] = [
    ...CHANNEL_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    { value: NO_NOTIFICATIONS, label: 'No notifications' },
  ];
  protected readonly categoryOptions: readonly DropdownOption[] = CATEGORY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  protected readonly timeFormatOptions: readonly DropdownOption[] = TIME_FORMAT_OPTIONS;
  protected readonly numberFormatOptions: readonly DropdownOption[] = NUMBER_FORMAT_OPTIONS;
  protected readonly themeOptions: readonly DropdownOption[] = THEME_OPTIONS;
  protected readonly landingPageOptions: readonly DropdownOption[] = LANDING_PAGE_OPTIONS;
  protected readonly orderTypeOptions: readonly DropdownOption[] = ORDER_TYPE_OPTIONS;
  protected readonly assistantOptions: readonly DropdownOption[] = [
    { value: 'yes', label: 'Yes, turn on the signal assistant' },
    { value: 'no', label: 'No assistant' },
  ];
  /** Each date format with an example in it, drawn once from the fixed sample date. */
  protected readonly dateFormatOptions: readonly DropdownOption[] = DATE_FORMAT_VALUES.map((value) => ({
    value,
    label: `${DATE_FORMAT_NAMES[value]} (${formatDate(SAMPLE_MOMENT, datePattern(value), 'en-US')})`,
  }));

  // ---- What the controls show --------------------------------------------------------------------------------------

  protected readonly selectedChannels = computed<readonly string[]>(() => {
    const channels = this.draft().channels;
    return channels.length > 0 ? channels : [NO_NOTIFICATIONS];
  });
  protected readonly noNotifications = computed(() => this.draft().channels.length === 0);

  /** The draft's formats applied to a fixed sample, so a choice can be judged before it is saved. */
  protected readonly preview = computed(() => {
    const draft = this.draft();
    const locale = numberLocale(draft.numberFormat);
    const date = resolveDatePattern('medium', draft.dateFormat, draft.timeFormat) ?? 'medium';
    return {
      date: formatDate(SAMPLE_MOMENT, date, 'en-US'),
      number: formatNumber(SAMPLE_AMOUNT, locale, '1.2-2'),
      money: formatCurrency(SAMPLE_AMOUNT, locale, currencySymbol(draft.preferredCurrency), draft.preferredCurrency, '1.2-2'),
    };
  });

  /** The account's currency, fixed when the account was opened. Shown as a fact, never as a control. */
  protected readonly accountCurrency = computed(() => this.accounts.linked()?.overview.balance.currency ?? null);

  // ---- Edits -------------------------------------------------------------------------------------------------------

  private patch(change: Partial<PreferenceValues>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.saveError.set('');
  }

  protected setChannels(ids: readonly string[]): void {
    const wasEmpty = this.draft().channels.length === 0;
    const chosen = ids.map(String);
    // Picking "No notifications" while channels are on clears them; picking a channel while it is on drops it.
    const channels = !wasEmpty && chosen.includes(NO_NOTIFICATIONS)
      ? []
      : (chosen.filter((id) => id !== NO_NOTIFICATIONS) as NotificationChannel[]);
    this.patch({ channels });
  }

  protected setCategories(ids: readonly string[]): void {
    this.patch({ categories: ids.map(String) as NotificationCategory[] });
  }

  protected setDateFormat(value: string): void {
    this.patch({ dateFormat: value as DateFormat });
  }

  protected setTimeFormat(value: string): void {
    this.patch({ timeFormat: value as TimeFormat });
  }

  protected setNumberFormat(value: string): void {
    this.patch({ numberFormat: value as NumberFormat });
  }

  protected setAssistant(value: string): void {
    this.patch({ aiAssistantEnabled: value === 'yes' });
  }

  protected setTheme(value: string): void {
    this.patch({ theme: value as Theme });
  }

  protected setLandingPage(value: string): void {
    this.patch({ landingPage: value as LandingPage });
  }

  protected setOrderType(value: string): void {
    this.patch({ defaultOrderType: value as OrderType });
  }

  protected discard(): void {
    this.draft.set(this.store.current());
    this.twoFactorDraft.set(null);
    this.twoFactorError.set('');
    this.saveError.set('');
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    try {
      if (this.twoFactorDirty()) {
        await this.saveTwoFactor();
      }
      if (!samePreferences(this.draft(), this.store.current())) {
        await this.store.save(valuesOf(this.draft()));
      }
      this.notifications.success('Settings saved');
    } catch (error) {
      this.saveError.set(describeError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** The login's own call. If the server refuses it (no way to email a code), nothing else is saved and the choice stays to be changed. */
  private async saveTwoFactor(): Promise<void> {
    const enabled = this.twoFactorDraft() === true;
    this.twoFactorBusy.set(true);
    try {
      const user = await this.auth.setTwoFactor(enabled);
      this.twoFactorEnabled.set(user.twoFactorEnabled);
      this.twoFactorDraft.set(null);
    } catch (error) {
      this.twoFactorError.set(describeError(error));
      throw error;
    } finally {
      this.twoFactorBusy.set(false);
    }
  }

  protected openAccountSetup(): void {
    this.authDialog.open('account');
  }
}

/** How each date format is named in the dropdown, ahead of its example. */
const DATE_FORMAT_NAMES: Readonly<Record<DateFormat, string>> = {
  [DateFormat.MonDdYyyy]: 'Mon D, YYYY',
  [DateFormat.DdMmYyyy]: 'DD/MM/YYYY',
  [DateFormat.MmDdYyyy]: 'MM/DD/YYYY',
  [DateFormat.DdMonthYyyy]: 'DD-Month-YYYY',
  [DateFormat.DdMonYyyy]: 'DD-Mon-YYYY',
  [DateFormat.YyyyMmDd]: 'YYYY-MM-DD',
};

/** The narrow symbol for a supported currency, so the preview reads "₹" rather than "INR". */
function currencySymbol(currency: Currency): string {
  switch (currency) {
    case Currency.Usd:
      return '$';
    case Currency.Eur:
      return '€';
    case Currency.Gbp:
      return '£';
    case Currency.Inr:
      return '₹';
    case Currency.Jpy:
      return '¥';
    case Currency.Cny:
      return 'CN¥';
    case Currency.Cad:
      return 'CA$';
    case Currency.Aud:
      return 'A$';
    case Currency.Chf:
      return 'CHF';
    case Currency.Sgd:
      return 'S$';
  }
}
