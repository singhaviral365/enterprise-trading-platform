import {
  Currency,
  DateFormat,
  LandingPage,
  NotificationCategory,
  NotificationChannel,
  NumberFormat,
  OrderType,
  Theme,
  TimeFormat,
  asCurrency,
  datePattern,
  defaultPreferences,
  landingRoute,
  numberLocale,
  resolveDatePattern,
  samePreferences,
  timePattern,
  valuesOf,
} from './preferences';

describe('preferences', () => {
  describe('defaults', () => {
    it('match the Trade API: quiet, and the application as it looked before this was configurable', () => {
      expect(defaultPreferences('EUR')).toEqual({
        preferredCurrency: Currency.Eur,
        channels: [NotificationChannel.InApp],
        categories: [NotificationCategory.OrderStatus, NotificationCategory.WatchlistAlerts],
        dateFormat: DateFormat.MonDdYyyy,
        timeFormat: TimeFormat.H12,
        numberFormat: NumberFormat.Us,
        aiAssistantEnabled: false,
        theme: Theme.System,
        landingPage: LandingPage.Dashboard,
        defaultOrderType: OrderType.Market,
      });
    });

    it('use USD when the account currency is unknown or not one a customer can choose', () => {
      expect(defaultPreferences().preferredCurrency).toBe(Currency.Usd);
      expect(defaultPreferences('HKD').preferredCurrency).toBe(Currency.Usd);
    });

    it('asCurrency only accepts the supported codes', () => {
      expect(asCurrency('INR')).toBe(Currency.Inr);
      expect(asCurrency('inr')).toBeNull();
      expect(asCurrency(null)).toBeNull();
    });
  });

  describe('comparing', () => {
    it('treats the order of channels and categories as irrelevant', () => {
      const a = { ...defaultPreferences('USD'), channels: [NotificationChannel.Sms, NotificationChannel.Email] };
      const b = { ...a, channels: [NotificationChannel.Email, NotificationChannel.Sms] };

      expect(samePreferences(a, b)).toBe(true);
      expect(samePreferences(a, { ...a, theme: Theme.Dark })).toBe(false);
      expect(samePreferences(a, { ...a, channels: [] })).toBe(false);
    });

    it('valuesOf copies, so editing the copy never changes the saved document', () => {
      const saved = defaultPreferences('USD');
      const copy = valuesOf(saved);

      copy.channels.push(NotificationChannel.Sms);

      expect(saved.channels).toEqual([NotificationChannel.InApp]);
    });
  });

  describe('date and time patterns', () => {
    it.each([
      [DateFormat.DdMmYyyy, 'dd/MM/yyyy'],
      [DateFormat.MmDdYyyy, 'MM/dd/yyyy'],
      [DateFormat.DdMonthYyyy, 'dd-MMMM-yyyy'],
      [DateFormat.DdMonYyyy, 'dd-MMM-yyyy'],
      [DateFormat.YyyyMmDd, 'yyyy-MM-dd'],
      [DateFormat.MonDdYyyy, 'mediumDate'],
    ])('%s is written as %s', (format, pattern) => {
      expect(datePattern(format)).toBe(pattern);
    });

    it('writes the time on a 12 or 24-hour clock', () => {
      expect(timePattern(TimeFormat.H12)).toBe('mediumTime');
      expect(timePattern(TimeFormat.H24)).toBe('HH:mm:ss');
    });

    it('rewrites only the three named formats the app uses', () => {
      expect(resolveDatePattern('mediumDate', DateFormat.YyyyMmDd, TimeFormat.H12)).toBe('yyyy-MM-dd');
      expect(resolveDatePattern('mediumTime', DateFormat.YyyyMmDd, TimeFormat.H24)).toBe('HH:mm:ss');
      expect(resolveDatePattern('medium', DateFormat.DdMmYyyy, TimeFormat.H24)).toBe('dd/MM/yyyy, HH:mm:ss');
      expect(resolveDatePattern('medium', DateFormat.MonDdYyyy, TimeFormat.H24)).toBe('MMM d, y, HH:mm:ss');
      expect(resolveDatePattern('medium', DateFormat.DdMmYyyy, TimeFormat.H12)).toBe('dd/MM/yyyy, h:mm:ss a');
      // the application's own look stays exactly as it was
      expect(resolveDatePattern('medium', DateFormat.MonDdYyyy, TimeFormat.H12)).toBe('medium');
      // anything a template asks for specifically is left alone, and so is "no format"
      expect(resolveDatePattern('yyyy', DateFormat.YyyyMmDd, TimeFormat.H24)).toBe('yyyy');
      expect(resolveDatePattern(undefined, DateFormat.YyyyMmDd, TimeFormat.H24)).toBeUndefined();
    });
  });

  it('maps the number format to the locale that groups the digits that way', () => {
    expect(numberLocale(NumberFormat.Us)).toBe('en-US');
    expect(numberLocale(NumberFormat.In)).toBe('en-IN');
  });

  it('maps every landing page to a route', () => {
    expect(landingRoute(LandingPage.Dashboard)).toBe('/dashboard');
    expect(landingRoute(LandingPage.Market)).toBe('/market');
    expect(landingRoute(LandingPage.Positions)).toBe('/positions');
    expect(landingRoute(LandingPage.Orders)).toBe('/orders');
  });
});
