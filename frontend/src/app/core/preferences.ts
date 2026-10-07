import {
  Currency,
  DateFormat,
  LandingPage,
  NotificationCategory,
  NotificationChannel,
  NumberFormat,
  OrderType,
  Preferences,
  Theme,
  TimeFormat,
} from '../api/generated/preferences';

// The wire types come from the generated client, so they follow the contract.
export {
  Currency,
  DateFormat,
  LandingPage,
  NotificationCategory,
  NotificationChannel,
  NumberFormat,
  OrderType,
  Theme,
  TimeFormat,
} from '../api/generated/preferences';
export type { Preferences, PreferencesRequest } from '../api/generated/preferences';

/** The settings themselves: a saved `Preferences` without the bookkeeping (which account, when it was saved). */
export type PreferenceValues = Omit<Preferences, 'accountId' | 'updatedAt'>;

export interface PreferenceOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** What applies until the customer saves something; the Trade API's defaults, so the screen and the server agree. */
export function defaultPreferences(accountCurrency: string | null = null): PreferenceValues {
  return {
    preferredCurrency: asCurrency(accountCurrency) ?? Currency.Usd,
    channels: [NotificationChannel.InApp],
    categories: [NotificationCategory.OrderStatus, NotificationCategory.WatchlistAlerts],
    dateFormat: DateFormat.MonDdYyyy,
    timeFormat: TimeFormat.H12,
    numberFormat: NumberFormat.Us,
    aiAssistantEnabled: false,
    theme: Theme.System,
    landingPage: LandingPage.Dashboard,
    defaultOrderType: OrderType.Market,
  };
}

/** The supported currency for a code, or null for anything else (an account may be in a currency not on the list). */
export function asCurrency(code: string | null | undefined): Currency | null {
  return (Object.values(Currency) as string[]).includes(code ?? '') ? (code as Currency) : null;
}

/** The values of a saved document, for comparing and for sending back. */
export function valuesOf(preferences: Preferences | PreferenceValues): PreferenceValues {
  return {
    preferredCurrency: preferences.preferredCurrency,
    channels: [...preferences.channels],
    categories: [...preferences.categories],
    dateFormat: preferences.dateFormat,
    timeFormat: preferences.timeFormat,
    numberFormat: preferences.numberFormat,
    aiAssistantEnabled: preferences.aiAssistantEnabled,
    theme: preferences.theme,
    landingPage: preferences.landingPage,
    defaultOrderType: preferences.defaultOrderType,
  };
}

export function samePreferences(a: PreferenceValues, b: PreferenceValues): boolean {
  const sorted = (values: readonly string[]) => [...values].sort().join(',');
  return (
    a.preferredCurrency === b.preferredCurrency &&
    sorted(a.channels) === sorted(b.channels) &&
    sorted(a.categories) === sorted(b.categories) &&
    a.dateFormat === b.dateFormat &&
    a.timeFormat === b.timeFormat &&
    a.numberFormat === b.numberFormat &&
    a.aiAssistantEnabled === b.aiAssistantEnabled &&
    a.theme === b.theme &&
    a.landingPage === b.landingPage &&
    a.defaultOrderType === b.defaultOrderType
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Formats. The wire value names a format; these turn it into what Angular's pipes and Intl take.
// ---------------------------------------------------------------------------------------------------------------

/** Angular `date` pattern for a date format. `mediumDate` is the application's own look from before this was configurable. */
export function datePattern(format: DateFormat): string {
  switch (format) {
    case DateFormat.DdMmYyyy:
      return 'dd/MM/yyyy';
    case DateFormat.MmDdYyyy:
      return 'MM/dd/yyyy';
    case DateFormat.DdMonthYyyy:
      return 'dd-MMMM-yyyy';
    case DateFormat.DdMonYyyy:
      return 'dd-MMM-yyyy';
    case DateFormat.YyyyMmDd:
      return 'yyyy-MM-dd';
    case DateFormat.MonDdYyyy:
      return 'mediumDate';
  }
}

/** Angular `date` pattern for a time of day, with seconds (what `mediumTime` shows). */
export function timePattern(format: TimeFormat): string {
  return format === TimeFormat.H24 ? 'HH:mm:ss' : 'mediumTime';
}

/**
 * The pattern to hand to Angular's `date` pipe in place of the one a template wrote. Only the three named formats the
 * app uses (`mediumDate`, `mediumTime`, `medium`) follow the customer's choice; anything else is left alone, so a
 * template that asks for something specific keeps it.
 */
export function resolveDatePattern(requested: string | undefined, date: DateFormat, time: TimeFormat): string | undefined {
  switch (requested) {
    case 'mediumDate':
      return datePattern(date);
    case 'mediumTime':
      return timePattern(time);
    case 'medium':
      return date === DateFormat.MonDdYyyy && time === TimeFormat.H12
        ? 'medium'
        : `${datePatternForCombinedMedium(date)}, ${timePatternForCombinedMedium(time)}`;
    default:
      return requested;
  }
}

/** Named aliases only work when they are the whole format; combined formats must use concrete patterns. */
function datePatternForCombinedMedium(format: DateFormat): string {
  return format === DateFormat.MonDdYyyy ? 'MMM d, y' : datePattern(format);
}

/** Named aliases only work when they are the whole format; combined formats must use concrete patterns. */
function timePatternForCombinedMedium(format: TimeFormat): string {
  return format === TimeFormat.H12 ? 'h:mm:ss a' : timePattern(format);
}

/** The locale whose digit grouping the format names: `en-US` (100,000,000) or `en-IN` (10,00,00,000). */
export function numberLocale(format: NumberFormat): string {
  return format === NumberFormat.In ? 'en-IN' : 'en-US';
}

// ---------------------------------------------------------------------------------------------------------------
// What the settings screen offers.
// ---------------------------------------------------------------------------------------------------------------

export const CURRENCY_OPTIONS: readonly PreferenceOption<Currency>[] = [
  { value: Currency.Usd, label: 'US dollar (USD)' },
  { value: Currency.Eur, label: 'Euro (EUR)' },
  { value: Currency.Gbp, label: 'British pound (GBP)' },
  { value: Currency.Inr, label: 'Indian rupee (INR)' },
  { value: Currency.Jpy, label: 'Japanese yen (JPY)' },
  { value: Currency.Cad, label: 'Canadian dollar (CAD)' },
  { value: Currency.Aud, label: 'Australian dollar (AUD)' },
  { value: Currency.Chf, label: 'Swiss franc (CHF)' },
  { value: Currency.Sgd, label: 'Singapore dollar (SGD)' },
  { value: Currency.Cny, label: 'Chinese yuan (CNY)' },
];

export const CHANNEL_OPTIONS: readonly PreferenceOption<NotificationChannel>[] = [
  { value: NotificationChannel.Sms, label: 'SMS' },
  { value: NotificationChannel.Email, label: 'Email' },
  { value: NotificationChannel.InApp, label: 'In-application' },
];

export const CATEGORY_OPTIONS: readonly PreferenceOption<NotificationCategory>[] = [
  { value: NotificationCategory.OrderStatus, label: 'Order status (filled or rejected)' },
  { value: NotificationCategory.WatchlistAlerts, label: 'Watchlist alerts' },
];

export const DATE_FORMAT_VALUES: readonly DateFormat[] = [
  DateFormat.MonDdYyyy,
  DateFormat.DdMmYyyy,
  DateFormat.MmDdYyyy,
  DateFormat.DdMonthYyyy,
  DateFormat.DdMonYyyy,
  DateFormat.YyyyMmDd,
];

export const TIME_FORMAT_OPTIONS: readonly PreferenceOption<TimeFormat>[] = [
  { value: TimeFormat.H12, label: '12-hour (3:07 PM)' },
  { value: TimeFormat.H24, label: '24-hour (15:07)' },
];

export const NUMBER_FORMAT_OPTIONS: readonly PreferenceOption<NumberFormat>[] = [
  { value: NumberFormat.Us, label: 'US (100,000,000)' },
  { value: NumberFormat.In, label: 'Indian (10,00,00,000)' },
];

export const THEME_OPTIONS: readonly PreferenceOption<Theme>[] = [
  { value: Theme.System, label: 'Match my device' },
  { value: Theme.Light, label: 'Light' },
  { value: Theme.Dark, label: 'Dark' },
];

export const LANDING_PAGE_OPTIONS: readonly PreferenceOption<LandingPage>[] = [
  { value: LandingPage.Dashboard, label: 'Dashboard' },
  { value: LandingPage.Market, label: 'Market data' },
  { value: LandingPage.Positions, label: 'Positions' },
  { value: LandingPage.Orders, label: 'Order history' },
];

export const ORDER_TYPE_OPTIONS: readonly PreferenceOption<OrderType>[] = [
  { value: OrderType.Market, label: 'Market (fills at the live price)' },
  { value: OrderType.Limit, label: 'Limit (you set the price)' },
];

/** The route a landing page opens. */
export function landingRoute(page: LandingPage): string {
  switch (page) {
    case LandingPage.Market:
      return '/market';
    case LandingPage.Positions:
      return '/positions';
    case LandingPage.Orders:
      return '/orders';
    case LandingPage.Dashboard:
      return '/dashboard';
  }
}
