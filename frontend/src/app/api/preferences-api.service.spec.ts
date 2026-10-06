import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TRADE_API_BASE_URL, provideApiClients } from './api.config';
import {
  DateFormat,
  Currency,
  LandingPage,
  NotificationCategory,
  NotificationChannel,
  NumberFormat,
  OrderType,
  PreferencesRequest,
  Theme,
  TimeFormat,
} from './generated/preferences';
import { PreferencesApi } from './preferences-api.service';

const URL = `${TRADE_API_BASE_URL}/api/v1/accounts/1001/preferences`;

const REQUEST: PreferencesRequest = {
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
};

/** The wrapper is the app's only door to the generated Preferences client, so these pin it to the contract. */
describe('PreferencesApi', () => {
  let api: PreferencesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(PreferencesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the preferences of an account', () => {
    api.get(1001).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('replaces the whole document with PUT', () => {
    api.replace(1001, REQUEST).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(REQUEST);
    req.flush({});
  });
});
