import { formatCurrency, formatDate, formatNumber } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { describeError } from '../../core/errors/describe-error';
import { NotificationService } from '../../core/notification.service';
import {
  CATEGORY_OPTIONS,
  CHANNEL_OPTIONS,
  CURRENCY_OPTIONS,
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
import { Multiselect, MultiselectOption } from '../../shared/ui/multiselect/multiselect';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** The "No notifications" chip is not a channel: choosing it empties the list, and an empty list shows it chosen. */
const NO_NOTIFICATIONS = 'NONE';

/** A fixed moment to show formats on, so the preview never changes under the customer's feet. */
const SAMPLE_MOMENT = new Date(2026, 9, 6, 15, 7, 9);
const SAMPLE_AMOUNT = 1234567.891;

/**
 * Settings: where a customer sets how they are alerted, which currency estimates are shown in, how dates, times and
 * numbers are written, whether the chatbot icon appears, and a few display choices. One form, one Save: the whole
 * document goes to the Trade API in a single `PUT`, and the rest of the app follows it as soon as it is stored.
 *
 * The form edits a draft; nothing changes anywhere else until Save. The preview under "Display" is drawn from the
 * draft, so a format can be judged before it is kept.
 */
@Component({
  selector: 'app-settings',
  imports: [Dropdown, Multiselect, Spinner],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly store = inject(PreferencesStore);
  protected readonly accounts = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);
  private readonly notifications = inject(NotificationService);

  /** What the form is editing. It starts again from the stored values whenever those change (a load, a save). */
  protected readonly draft = linkedSignal<PreferenceValues>(() => this.store.current());
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  protected readonly dirty = computed(() => !samePreferences(this.draft(), this.store.current()));

  // ---- The options, in the shapes the shared controls take ---------------------------------------------------------

  protected readonly channelOptions: readonly MultiselectOption[] = [
    ...CHANNEL_OPTIONS.map((option) => ({ id: option.value, label: option.label })),
    { id: NO_NOTIFICATIONS, label: 'No notifications' },
  ];
  protected readonly categoryOptions: readonly MultiselectOption[] = CATEGORY_OPTIONS.map((option) => ({
    id: option.value,
    label: option.label,
  }));
  protected readonly currencyOptions: readonly DropdownOption[] = CURRENCY_OPTIONS;
  protected readonly timeFormatOptions: readonly DropdownOption[] = TIME_FORMAT_OPTIONS;
  protected readonly numberFormatOptions: readonly DropdownOption[] = NUMBER_FORMAT_OPTIONS;
  protected readonly themeOptions: readonly DropdownOption[] = THEME_OPTIONS;
  protected readonly landingPageOptions: readonly DropdownOption[] = LANDING_PAGE_OPTIONS;
  protected readonly orderTypeOptions: readonly DropdownOption[] = ORDER_TYPE_OPTIONS;
  protected readonly assistantOptions: readonly DropdownOption[] = [
    { value: 'yes', label: 'Yes, show the chatbot icon' },
    { value: 'no', label: 'No chatbot' },
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

  /** True when estimates will be shown in a currency other than the account's own, which is worth saying. */
  protected readonly differsFromAccount = computed(() => {
    const account = this.accounts.linked()?.overview.balance.currency;
    return !!account && account !== this.draft().preferredCurrency;
  });
  protected readonly accountCurrency = computed(() => this.accounts.linked()?.overview.balance.currency ?? null);

  // ---- Edits -------------------------------------------------------------------------------------------------------

  private patch(change: Partial<PreferenceValues>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.saveError.set('');
  }

  protected setChannels(ids: readonly (string | number)[]): void {
    const wasEmpty = this.draft().channels.length === 0;
    const chosen = ids.map(String);
    // Picking "No notifications" while channels are on clears them; picking a channel while it is on drops it.
    const channels = !wasEmpty && chosen.includes(NO_NOTIFICATIONS)
      ? []
      : (chosen.filter((id) => id !== NO_NOTIFICATIONS) as NotificationChannel[]);
    this.patch({ channels });
  }

  protected setCategories(ids: readonly (string | number)[]): void {
    this.patch({ categories: ids.map(String) as NotificationCategory[] });
  }

  protected setCurrency(value: string): void {
    this.patch({ preferredCurrency: value as Currency });
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
    this.saveError.set('');
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.dirty()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    try {
      await this.store.save(valuesOf(this.draft()));
      this.notifications.success('Settings saved');
    } catch (error) {
      this.saveError.set(describeError(error));
    } finally {
      this.saving.set(false);
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
