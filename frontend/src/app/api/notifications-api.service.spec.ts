import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClients } from './api.config';
import { NotificationCategory } from './generated/notifications';
import { NotificationsApi } from './notifications-api.service';

const BASE = '/api/v1/accounts/7/notifications';

/** The wrapper is the app's only door to the generated Notifications client, so these pin it to the contract. */
describe('NotificationsApi', () => {
  let api: NotificationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(NotificationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the inbox with no filters by default', () => {
    api.list(7).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({});
  });

  it('sends the search text, every chosen category and the paging', () => {
    api
      .list(7, {
        q: 'AAPL',
        categories: [NotificationCategory.OrderStatus, NotificationCategory.WatchlistAlerts],
        page: 2,
        size: 10,
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('q')).toBe('AAPL');
    expect(req.request.params.getAll('category')).toEqual(['ORDER_STATUS', 'WATCHLIST_ALERTS']);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('10');
    req.flush({});
  });

  it('leaves out an empty search and an empty category list', () => {
    api.list(7, { q: '', categories: [], page: 0, size: 5 }).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('category')).toBe(false);
    req.flush({});
  });

  it('marks a notification read with a POST to its read route', () => {
    api.markRead(7, 42).subscribe();

    const req = http.expectOne(`${BASE}/42/read`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
