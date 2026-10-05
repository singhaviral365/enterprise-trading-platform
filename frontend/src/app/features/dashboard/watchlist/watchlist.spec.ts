import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { DialogService } from '../../../core/dialog.service';
import { SessionService } from '../../../core/session.service';
import { PriceStatus, type Watchlist, type WatchlistItem } from '../../../core/watchlist.service';
import { WatchlistPanel } from './watchlist';

const BASE = '/api/v1/accounts/1001/watchlists';

function item(tickerSymbol: string, over: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    tickerSymbol,
    addedAt: '2026-10-04T06:00:00Z',
    price: 189.5,
    quotedAt: '2026-10-04T09:00:00Z',
    priceStatus: PriceStatus.Live,
    ...over,
  };
}

function list(watchlistId: number, name: string, items: WatchlistItem[] = []): Watchlist {
  return {
    watchlistId,
    accountId: 1001,
    name,
    createdAt: '2026-10-04T06:00:00Z',
    updatedAt: '2026-10-04T06:00:00Z',
    items,
  };
}

describe('WatchlistPanel', () => {
  let fixture: ComponentFixture<WatchlistPanel>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(testId: string): Promise<void> {
    byTestId<HTMLFormElement>(testId)!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  }

  async function click(testId: string): Promise<void> {
    byTestId<HTMLButtonElement>(testId)!.click();
    await fixture.whenStable();
  }

  /** Answers the shared account store (link + overview) and the market suggestions. */
  async function answerAccount(linked: boolean, quotes: object[] = [{ symbol: 'MSFT' }]): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush(
      linked
        ? { linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' }
        : { linked: false, message: 'No linked account yet' },
    );
    if (linked) {
      const account = '/api/v1/accounts/1001';
      (await vi.waitFor(() => http.expectOne(account))).flush({
        id: 1001,
        accountId: 'ACC000001001',
        holderName: 'USER-1000',
        cashBalance: 25000,
        status: 'ACTIVE',
        version: 1,
        lastUpdated: '2026-10-01T00:00:00Z',
      });
      http.expectOne(`${account}/balance`).flush({ accountId: 1001, cashBalance: 25000, currency: 'USD', asOf: '' });
      http.expectOne(`${account}/positions`).flush([]);
      http.expectOne(`${account}/orders`).flush([]);
    }
    (await vi.waitFor(() => http.expectOne('/api/v1/market/quotes'))).flush({
      quotes,
      asOf: '',
      stale: false,
    });
    // No whenStable here: with an account, the watchlist request is now in flight and keeps the app unstable.
    if (!linked) {
      await fixture.whenStable();
    }
  }

  async function start(lists: Watchlist[], quotes?: object[]): Promise<void> {
    await answerAccount(true, quotes);
    (await vi.waitFor(() => http.expectOne(BASE))).flush(lists);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [WatchlistPanel],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', { expiresIn: 900 });
    fixture = TestBed.createComponent(WatchlistPanel);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  it('shows a calm message and makes no watchlist call when there is no linked account', async () => {
    await answerAccount(false);
    expect(byTestId('watchlist-no-account')?.textContent).toContain('Open an account');
    expect(byTestId<HTMLButtonElement>('watchlist-new')!.disabled).toBe(true);
  });

  it('shows the empty state when the account has no watchlists', async () => {
    await start([]);
    expect(byTestId('watchlist-empty')).not.toBeNull();
  });

  it('renders live, delayed and not-yet-priced stocks', async () => {
    await start([
      list(9, 'Tech', [
        item('AAPL'),
        item('AMZN', { priceStatus: PriceStatus.Stale, price: 250 }),
        item('TSLA', { priceStatus: PriceStatus.Unavailable, price: null, quotedAt: null }),
      ]),
    ]);

    expect(byTestId('watchlist-status-AAPL')?.textContent).toContain('Live');
    expect(byTestId('watchlist-price-AAPL')?.textContent).toContain('189.50');
    expect(byTestId('watchlist-status-AMZN')?.textContent).toContain('Delayed');
    expect(byTestId('watchlist-price-AMZN')?.textContent).toContain('250.00');
    expect(byTestId('watchlist-price-TSLA')?.textContent).toContain('No quote yet');
    expect(byTestId('watchlist-status-TSLA')?.textContent).toContain('Waiting');
  });

  it('shows the day change as a green or red pill beside the symbol', async () => {
    await start(
      [list(9, 'Tech', [item('AAPL'), item('AMZN'), item('TSLA')])],
      [
        { symbol: 'AAPL', details: { change: 3.37, changePercent: 1.02 } },
        { symbol: 'AMZN', details: { change: -2.1, changePercent: -0.85 } },
      ],
    );

    const up = byTestId('watchlist-change-AAPL')!;
    expect(up.textContent).toContain('+3.37');
    expect(up.textContent).toContain('(+1.02%)');
    expect(up.classList.contains('is-up')).toBe(true);

    const down = byTestId('watchlist-change-AMZN')!;
    expect(down.textContent).toContain('-2.10');
    expect(down.textContent).toContain('(-0.85%)');
    expect(down.classList.contains('is-down')).toBe(true);

    // No change data for this symbol: no pill rather than a made-up zero.
    expect(byTestId('watchlist-change-TSLA')).toBeNull();
  });

  it('adds a stock, upper-casing and trimming the ticker', async () => {
    await start([list(9, 'Tech')]);
    await type('watchlist-ticker-input', '  aapl ');
    await submit('watchlist-add-form');

    const request = await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${BASE}/9/items` }));
    expect(request.request.body).toEqual({ tickerSymbol: 'AAPL' });
    request.flush(list(9, 'Tech', [item('AAPL')]));
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-row-AAPL')).not.toBeNull());
    expect(byTestId<HTMLInputElement>('watchlist-ticker-input')!.value).toBe('');
  });

  it.each([
    ['INS-404', 404, 'not available for trading'],
    ['WLI-409', 409, 'already on this watchlist'],
  ])('shows %s next to the ticker box', async (code, status, text) => {
    await start([list(9, 'Tech')]);
    await type('watchlist-ticker-input', 'NOPE');
    await submit('watchlist-add-form');

    http
      .expectOne({ method: 'POST', url: `${BASE}/9/items` })
      .flush({ errorCode: code, message: 'dev text' }, { status, statusText: 'err' });
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-ticker-error')?.textContent).toContain(text));
  });

  it('does not call the API for a blank ticker', async () => {
    await start([list(9, 'Tech')]);
    await submit('watchlist-add-form');
    expect(byTestId('watchlist-ticker-error')?.textContent).toContain('Enter a ticker');
  });

  it('removes a stock', async () => {
    await start([list(9, 'Tech', [item('AAPL'), item('AMZN')])]);
    await click('watchlist-remove-AAPL');

    const request = await vi.waitFor(() => http.expectOne({ method: 'DELETE', url: `${BASE}/9/items/AAPL` }));
    request.flush(list(9, 'Tech', [item('AMZN')]));
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-row-AAPL')).toBeNull());
    expect(byTestId('watchlist-row-AMZN')).not.toBeNull();
  });

  it('creates a watchlist and selects it', async () => {
    await start([list(9, 'Tech')]);
    await click('watchlist-new');
    await type('watchlist-name-input', ' Energy ');
    await submit('watchlist-name-form');

    const request = await vi.waitFor(() => http.expectOne({ method: 'POST', url: BASE }));
    expect(request.request.body).toEqual({ name: 'Energy' });
    request.flush(list(10, 'Energy'));
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-selected-name')?.textContent).toContain('Energy'));
    expect(byTestId('watchlist-name-form')).toBeNull();
  });

  it('keeps the name form open and shows a duplicate-name error', async () => {
    await start([list(9, 'Tech')]);
    await click('watchlist-new');
    await type('watchlist-name-input', 'tech');
    await submit('watchlist-name-form');

    http.expectOne({ method: 'POST', url: BASE }).flush({ errorCode: 'WTL-409', message: 'x' }, { status: 409, statusText: 'err' });
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-name-error')?.textContent).toContain('already have a watchlist'));
  });

  it('rejects a blank name without calling the API', async () => {
    await start([list(9, 'Tech')]);
    await click('watchlist-new');
    await type('watchlist-name-input', '   ');
    await submit('watchlist-name-form');
    expect(byTestId('watchlist-name-error')?.textContent).toContain('Give the watchlist a name');
  });

  it('renames the selected watchlist', async () => {
    await start([list(9, 'Tech')]);
    await click('watchlist-rename');
    expect(byTestId<HTMLInputElement>('watchlist-name-input')!.value).toBe('Tech');
    await type('watchlist-name-input', 'Big tech');
    await submit('watchlist-name-form');

    const request = await vi.waitFor(() => http.expectOne({ method: 'PATCH', url: `${BASE}/9` }));
    expect(request.request.body).toEqual({ name: 'Big tech' });
    request.flush(list(9, 'Big tech'));
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-selected-name')?.textContent).toContain('Big tech'));
  });

  it('deletes a watchlist only after confirmation', async () => {
    await start([list(9, 'Tech', [item('AAPL')]), list(10, 'Energy')]);
    const dialog = TestBed.inject(DialogService);

    await click('watchlist-delete');
    expect(dialog.options().message).toContain('also removes its 1 stock');
    dialog.cancel();
    await fixture.whenStable();
    http.expectNone({ method: 'DELETE', url: `${BASE}/9` });

    await click('watchlist-delete');
    dialog.proceed();
    const request = await vi.waitFor(() => http.expectOne({ method: 'DELETE', url: `${BASE}/9` }));
    request.flush(null);
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-tab-9')).toBeNull());
    expect(byTestId('watchlist-selected-name')?.textContent).toContain('Energy');
  });

  it('disables New list at the watchlist limit', async () => {
    await start(Array.from({ length: 10 }, (_, i) => list(i + 1, `List ${i + 1}`)));
    expect(byTestId<HTMLButtonElement>('watchlist-new')!.disabled).toBe(true);
  });

  it('disables adding at the per-list stock limit', async () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`S${i}`));
    await start([list(9, 'Big', items)]);
    expect(byTestId<HTMLButtonElement>('watchlist-add')!.disabled).toBe(true);
    expect(byTestId<HTMLInputElement>('watchlist-ticker-input')!.disabled).toBe(true);
  });
});
