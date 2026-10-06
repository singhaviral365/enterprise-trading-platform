import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClients } from '../api/api.config';
import { AccountOverviewStore } from './account-overview.store';
import { FormatPreferences } from './format-preferences';
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
  defaultPreferences,
} from './preferences';
import { PreferencesStore } from './preferences.store';
import { SessionService } from './session.service';
import { ThemeService } from './theme.service';

const URL = '/api/v1/accounts/1001/preferences';

const SAVED: Preferences = {
  accountId: 1001,
  preferredCurrency: Currency.Eur,
  channels: [NotificationChannel.Email],
  categories: [NotificationCategory.OrderStatus],
  dateFormat: DateFormat.DdMmYyyy,
  timeFormat: TimeFormat.H24,
  numberFormat: NumberFormat.In,
  aiAssistantEnabled: true,
  theme: Theme.Dark,
  landingPage: LandingPage.Market,
  defaultOrderType: OrderType.Limit,
  updatedAt: '2026-10-06T10:00:00Z',
};

/** What the server answers for an account that never saved anything. */
const DEFAULTS: Preferences = {
  ...defaultPreferences('EUR'),
  accountId: 1001,
  updatedAt: null,
};

describe('PreferencesStore', () => {
  let http: HttpTestingController;
  let linked: ReturnType<typeof signal<unknown>>;
  let theme: { apply: ReturnType<typeof vi.fn> };
  let refresh: ReturnType<typeof vi.fn>;

  const linkedAccount = {
    linked: true,
    accountNumber: 'ACC000001001',
    overview: { balance: { currency: 'EUR' } },
  };

  function setUp(options: { signedIn?: boolean; account?: unknown } = {}): PreferencesStore {
    localStorage.clear();
    linked = signal<unknown>(options.account === undefined ? linkedAccount : options.account);
    theme = { apply: vi.fn() };
    refresh = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: AccountOverviewStore, useValue: { linked, refresh } },
        { provide: ThemeService, useValue: theme },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    if (options.signedIn ?? true) {
      TestBed.inject(SessionService).start('john', { expiresIn: 900 });
    }
    const store = TestBed.inject(PreferencesStore);
    TestBed.tick();
    return store;
  }

  afterEach(() => http.verify());

  it('uses the defaults, in the account currency, until something is loaded', () => {
    const store = setUp();
    http.expectOne(URL);

    expect(store.current().dateFormat).toBe(DateFormat.MonDdYyyy);
    expect(store.preferredCurrency()).toBe('EUR');
    expect(store.aiAssistantEnabled()).toBe(false);
    expect(store.landingRoute()).toBe('/dashboard');
    expect(store.state()).toBe('loading');
  });

  it('loads once the linked account is known, and the rest of the app follows what it finds', async () => {
    const store = setUp();

    http.expectOne(URL).flush(SAVED);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));
    TestBed.tick();

    expect(store.current().preferredCurrency).toBe(Currency.Eur);
    expect(store.customised()).toBe(true);
    expect(store.preferredCurrency()).toBe('EUR');
    expect(store.aiAssistantEnabled()).toBe(true);
    expect(store.defaultOrderType()).toBe(OrderType.Limit);
    expect(store.landingRoute()).toBe('/market');
    // the formats the pipes read, and the theme
    const formats = TestBed.inject(FormatPreferences);
    expect(formats.dateFormat()).toBe(DateFormat.DdMmYyyy);
    expect(formats.timeFormat()).toBe(TimeFormat.H24);
    expect(formats.locale()).toBe('en-IN');
    expect(theme.apply).toHaveBeenCalledWith(Theme.Dark);
  });

  it('does not touch the theme while the customer is still on the defaults', async () => {
    const store = setUp();

    http.expectOne(URL).flush(DEFAULTS);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));
    TestBed.tick();

    expect(store.customised()).toBe(false);
    expect(theme.apply).not.toHaveBeenCalled();
    expect(store.preferredCurrency()).toBe('EUR');
  });

  it('keeps the defaults and reports an error when the load fails, then recovers on reload', async () => {
    const store = setUp();

    http.expectOne(URL).flush('down', { status: 503, statusText: 'Service Unavailable' });
    await vi.waitFor(() => expect(store.state()).toBe('error'));

    expect(store.current()).toEqual(defaultPreferences('EUR'));

    store.reload();
    http.expectOne(URL).flush(SAVED);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));
    expect(store.current().landingPage).toBe(LandingPage.Market);
  });

  it('asks only once when two callers want the same account at the same time', async () => {
    const store = setUp();

    const first = store.loadFor(1001);
    const second = store.loadFor(1001);
    http.expectOne(URL).flush(SAVED);

    await expect(Promise.all([first, second])).resolves.toEqual([SAVED, SAVED]);
    // and once loaded, asking again is free
    await expect(store.loadFor(1001)).resolves.toEqual(SAVED);
  });

  it('does not load while there is no linked account', () => {
    const store = setUp({ account: null });

    expect(store.accountId()).toBeNull();
    expect(store.state()).toBe('idle');
  });

  it('saves the whole document with PUT and then shows what the server stored', async () => {
    const store = setUp();
    http.expectOne(URL).flush(DEFAULTS);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));

    const saving = store.save({ ...store.current(), theme: Theme.Light, aiAssistantEnabled: true });
    const put = http.expectOne(URL);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.theme).toBe(Theme.Light);
    expect(put.request.body.aiAssistantEnabled).toBe(true);
    expect(put.request.body.accountId).toBeUndefined();
    put.flush({ ...DEFAULTS, theme: Theme.Light, aiAssistantEnabled: true, updatedAt: '2026-10-06T11:00:00Z' });
    await saving;
    TestBed.tick();

    expect(store.customised()).toBe(true);
    expect(store.aiAssistantEnabled()).toBe(true);
    expect(theme.apply).toHaveBeenCalledWith(Theme.Light);
  });

  it('reads the account again after a save that moves it to another currency, and not otherwise', async () => {
    const store = setUp();
    http.expectOne(URL).flush(DEFAULTS);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));

    const same = store.save({ ...store.current(), theme: Theme.Light });
    http.expectOne(URL).flush({ ...DEFAULTS, theme: Theme.Light, updatedAt: '2026-10-06T11:00:00Z' });
    await same;
    expect(refresh).not.toHaveBeenCalled();

    const changed = store.save({ ...store.current(), preferredCurrency: Currency.Usd });
    const put = http.expectOne(URL);
    expect(put.request.body.preferredCurrency).toBe(Currency.Usd);
    put.flush({ ...DEFAULTS, preferredCurrency: Currency.Usd, updatedAt: '2026-10-06T11:05:00Z' });
    await changed;

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.current().preferredCurrency).toBe(Currency.Usd);
  });

  it('takes the currency from the account while it is loaded, whatever an older row says', async () => {
    const store = setUp();

    http.expectOne(URL).flush({ ...SAVED, preferredCurrency: Currency.Inr });
    await vi.waitFor(() => expect(store.state()).toBe('ready'));

    expect(store.preferredCurrency()).toBe('EUR');
  });

  it('rejects a save the server refuses, and keeps what it had', async () => {
    const store = setUp();
    http.expectOne(URL).flush(SAVED);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));

    const saving = store.save({ ...store.current(), theme: Theme.Light });
    http.expectOne(URL).flush({ errorCode: 'VAL-422', message: 'Invalid input' }, { status: 422, statusText: 'x' });

    await expect(saving).rejects.toMatchObject({ status: 422 });
    expect(store.current().theme).toBe(Theme.Dark);
  });

  it('cannot save without a linked account', async () => {
    const store = setUp({ account: null });

    await expect(store.save(defaultPreferences('USD'))).rejects.toThrow('no linked account');
  });

  it('forgets everything on sign-out, so the next customer starts from the defaults', async () => {
    const store = setUp();
    http.expectOne(URL).flush(SAVED);
    await vi.waitFor(() => expect(store.state()).toBe('ready'));
    TestBed.tick();
    expect(TestBed.inject(FormatPreferences).locale()).toBe('en-IN');

    TestBed.inject(SessionService).clear();
    TestBed.tick();

    expect(store.state()).toBe('idle');
    expect(store.customised()).toBe(false);
    expect(store.landingRoute()).toBe('/dashboard');
    expect(TestBed.inject(FormatPreferences).locale()).toBe('en-US');
  });
});
