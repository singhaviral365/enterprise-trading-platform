import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { DialogService } from '../../../core/dialog.service';
import { SessionService } from '../../../core/session.service';
import { AlertDelivery, AlertDirection, AlertStatus, PriceStatus, type Watchlist, type WatchlistItem } from '../../../core/watchlist.service';
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

  /** Chooses an option in the "Add a stock" dropdown (a native select inside app-dropdown). */
  async function chooseStock(value: string): Promise<void> {
    const select = root.querySelector<HTMLSelectElement>('#watchlist-stock')!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
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
  async function answerAccount(linked: boolean, quotes: object[] | 'error' = [{ symbol: 'MSFT' }]): Promise<void> {
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
    const board = await vi.waitFor(() => http.expectOne('/api/v1/market/quotes'));
    if (quotes === 'error') {
      board.flush(null, { status: 503, statusText: 'x' });
      return;
    }
    board.flush({
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

  it('shows each stock logo from the market quotes, and the two-letter tile when there is none', async () => {
    await start(
      [list(9, 'Tech', [item('AAPL'), item('MSFT'), item('TSLA')])],
      [
        { symbol: 'AAPL', iconUrl: '/assets/icons/AAPL.svg' },
        { symbol: 'MSFT', iconUrl: null },
      ],
    );

    const rowOf = (symbol: string) => byTestId(`watchlist-row-${symbol}`)!;
    expect(rowOf('AAPL').querySelector('img.icon-image')?.getAttribute('src')).toContain('/assets/icons/AAPL.svg');
    expect(rowOf('AAPL').querySelector('[data-testid="instrument-icon-fallback"]')).toBeNull();
    expect(rowOf('MSFT').querySelector('[data-testid="instrument-icon-fallback"]')?.textContent?.trim()).toBe('MS');
    expect(rowOf('TSLA').querySelector('[data-testid="instrument-icon-fallback"]')?.textContent?.trim()).toBe('TS');
  });

  it('matches the logo by symbol regardless of case', async () => {
    await start([list(9, 'Tech', [item('aapl')])], [{ symbol: 'AAPL', iconUrl: '/assets/icons/AAPL.svg' }]);

    expect(byTestId('watchlist-row-aapl')!.querySelector('img.icon-image')).toBeTruthy();
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

  const QUOTES = [
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
  ];

  it('offers the tradable instruments that are not on the list yet, in a dropdown, labelled with the name', async () => {
    await start([list(9, 'Tech', [item('AAPL')])], QUOTES);

    const options = Array.from(root.querySelectorAll<HTMLOptionElement>('#watchlist-stock option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['Choose a stock', 'MSFT, Microsoft Corp.']);
    expect(root.querySelector('datalist')).toBeNull();
    expect(byTestId('watchlist-ticker-input')).toBeNull();
  });

  it('keeps Add disabled until a stock is chosen', async () => {
    await start([list(9, 'Tech')], QUOTES);
    expect(byTestId<HTMLButtonElement>('watchlist-add')!.disabled).toBe(true);

    await chooseStock('AAPL');

    expect(byTestId<HTMLButtonElement>('watchlist-add')!.disabled).toBe(false);
  });

  it('adds the chosen stock and resets the dropdown', async () => {
    await start([list(9, 'Tech')], QUOTES);
    await chooseStock('AAPL');
    await submit('watchlist-add-form');

    const request = await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${BASE}/9/items` }));
    expect(request.request.body).toEqual({ tickerSymbol: 'AAPL' });
    request.flush(list(9, 'Tech', [item('AAPL')]));
    await fixture.whenStable();

    await vi.waitFor(() => expect(byTestId('watchlist-row-AAPL')).not.toBeNull());
    expect(root.querySelector<HTMLSelectElement>('#watchlist-stock')!.value).toBe('');
    expect(byTestId<HTMLButtonElement>('watchlist-add')!.disabled).toBe(true);
  });

  it.each([
    ['INS-404', 404, 'not available for trading'],
    ['WLI-409', 409, 'already on this watchlist'],
  ])('shows %s next to the dropdown', async (code, status, text) => {
    await start([list(9, 'Tech')], QUOTES);
    await chooseStock('AAPL');
    await submit('watchlist-add-form');

    http
      .expectOne({ method: 'POST', url: `${BASE}/9/items` })
      .flush({ errorCode: code, message: 'dev text' }, { status, statusText: 'err' });
    await fixture.whenStable();

    await vi.waitFor(() => expect(root.querySelector('#watchlist-stock-error')?.textContent).toContain(text));
  });

  it('does not call the API when nothing is chosen, even if the form is submitted directly', async () => {
    await start([list(9, 'Tech')], QUOTES);

    await submit('watchlist-add-form');

    http.expectNone({ method: 'POST', url: `${BASE}/9/items` });
  });

  it('says so when the stock list could not be loaded, and disables the dropdown', async () => {
    await answerAccount(true, 'error');
    (await vi.waitFor(() => http.expectOne(BASE))).flush([list(9, 'Tech')]);
    await fixture.whenStable();

    expect(byTestId('watchlist-stocks-unavailable')).not.toBeNull();
    expect(root.querySelector<HTMLSelectElement>('#watchlist-stock')!.disabled).toBe(true);
  });

  it('says so when every available stock is already on the list', async () => {
    await start([list(9, 'Tech', [item('AAPL'), item('MSFT')])], QUOTES);

    expect(byTestId('watchlist-stocks-none')).not.toBeNull();
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
    expect(root.querySelector<HTMLSelectElement>('#watchlist-stock')!.disabled).toBe(true);
  });
  // ---------------------------------------------------------------------------------------------------------------
  // Price alerts: the Alert column and the editor under a row
  // ---------------------------------------------------------------------------------------------------------------
  describe('price alerts', () => {
    const SET_URL = `${BASE}/9/items/AAPL/alert`;
    const input = (id: string) => byTestId<HTMLInputElement>(id)!;
    const alerted = (alert: object) => list(9, 'Tech', [item('AAPL', { alert } as Partial<WatchlistItem>)]);
    const active = (direction: AlertDirection, targetPrice: number) => ({
      direction,
      targetPrice,
      status: AlertStatus.Active,
      setAt: '2026-10-06T09:00:00Z',
      triggeredAt: null,
      triggerPrice: null,
      delivery: null,
    });
    const fired = (delivery: AlertDelivery) => ({
      direction: AlertDirection.Above,
      targetPrice: 200,
      status: AlertStatus.Triggered,
      setAt: '2026-10-06T09:00:00Z',
      triggeredAt: '2026-10-06T10:00:00Z',
      triggerPrice: 201.25,
      delivery,
    });
    async function typeTarget(value: string): Promise<void> {
      await type('watchlist-alert-target', value);
    }
    async function pickDirection(value: AlertDirection): Promise<void> {
      const select = root.querySelector<HTMLSelectElement>('#watchlist-alert-direction')!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    }

    it('offers Set alert on an entry that has none, and no editor until it is asked for', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);

      expect(byTestId('watchlist-alert-set-AAPL')?.textContent).toContain('Set alert');
      expect(byTestId('watchlist-alert-form-AAPL')).toBeNull();
    });

    it('keeps Set alert disabled until the target is a valid price the market has not reached', async () => {
      // AAPL trades at 189.50 in these specs.
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      const save = () => byTestId<HTMLButtonElement>('watchlist-alert-save')!;
      expect(save().disabled).toBe(true);

      await typeTarget('abc');
      expect(byTestId('watchlist-alert-target-error')?.textContent).toContain('above 0 with up to 4 decimal places');
      expect(save().disabled).toBe(true);

      await typeTarget('1.23456');
      expect(save().disabled).toBe(true);

      await typeTarget('0');
      expect(save().disabled).toBe(true);

      await typeTarget('150');
      expect(byTestId('watchlist-alert-target-error')?.textContent).toContain('already at or above this');
      expect(save().disabled).toBe(true);

      await typeTarget('189.50');
      expect(save().disabled).toBe(true);

      await typeTarget('200');
      expect(byTestId('watchlist-alert-target-error')).toBeNull();
      expect(save().disabled).toBe(false);
    });

    it('applies the mirror rule to a Below alert', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await pickDirection(AlertDirection.Below);

      await typeTarget('200');
      expect(byTestId('watchlist-alert-target-error')?.textContent).toContain('already at or below this');
      expect(byTestId<HTMLButtonElement>('watchlist-alert-save')!.disabled).toBe(true);

      await typeTarget('180');
      expect(byTestId('watchlist-alert-target-error')).toBeNull();
      expect(byTestId<HTMLButtonElement>('watchlist-alert-save')!.disabled).toBe(false);
    });

    it('accepts any target when no price is known yet', async () => {
      await start([list(9, 'Tech', [item('AAPL', { price: null, quotedAt: null, priceStatus: PriceStatus.Unavailable })])]);
      await click('watchlist-alert-set-AAPL');

      await typeTarget('1');

      expect(byTestId<HTMLButtonElement>('watchlist-alert-save')!.disabled).toBe(false);
    });

    it('sets the alert with its direction and target, then shows it on the row', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await typeTarget('200.5');
      await submit('watchlist-alert-form-AAPL');

      const request = await vi.waitFor(() => http.expectOne({ method: 'PUT', url: SET_URL }));
      expect(request.request.body).toEqual({ direction: 'ABOVE', targetPrice: 200.5 });
      request.flush(alerted(active(AlertDirection.Above, 200.5)));
      await fixture.whenStable();

      await vi.waitFor(() => expect(byTestId('watchlist-alert-AAPL')?.textContent).toContain('Above 200.5'));
      expect(byTestId('watchlist-alert-state-AAPL')?.textContent).toContain('Active');
      expect(byTestId('watchlist-alert-form-AAPL')).toBeNull();
    });

    it('sends a Below alert as BELOW', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await pickDirection(AlertDirection.Below);
      await typeTarget('180');
      await submit('watchlist-alert-form-AAPL');

      const request = await vi.waitFor(() => http.expectOne({ method: 'PUT', url: SET_URL }));
      expect(request.request.body).toEqual({ direction: 'BELOW', targetPrice: 180 });
      request.flush(alerted(active(AlertDirection.Below, 180)));
    });

    it('never sends an alert the form can see is invalid, even if it is submitted directly', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await typeTarget('100');

      await submit('watchlist-alert-form-AAPL');

      http.expectNone({ method: 'PUT', url: SET_URL });
    });

    it('edits an active alert, starting from what it says now', async () => {
      await start([alerted(active(AlertDirection.Above, 200))]);
      await click('watchlist-alert-AAPL');

      expect(input('watchlist-alert-target').value).toBe('200');
      expect(byTestId('watchlist-alert-save')?.textContent).toContain('Update alert');
    });

    it('removes an alert', async () => {
      await start([alerted(active(AlertDirection.Above, 200))]);
      await click('watchlist-alert-AAPL');
      await click('watchlist-alert-clear');

      const request = await vi.waitFor(() => http.expectOne({ method: 'DELETE', url: SET_URL }));
      request.flush(list(9, 'Tech', [item('AAPL')]));
      await fixture.whenStable();

      await vi.waitFor(() => expect(byTestId('watchlist-alert-set-AAPL')).not.toBeNull());
      expect(byTestId('watchlist-alert-form-AAPL')).toBeNull();
    });

    it.each([
      [AlertDelivery.HandedOver, 'Notified', 'is-triggered'],
      [AlertDelivery.Pending, 'Sending', 'is-triggered'],
      [AlertDelivery.Failed, 'Delivery failed', 'is-failed'],
    ])('shows a fired alert with the price that crossed it and how delivery went (%s)', async (delivery, words, css) => {
      await start([alerted(fired(delivery))]);

      const chip = byTestId('watchlist-alert-AAPL')!;
      expect(chip.classList.contains(css)).toBe(true);
      expect(chip.textContent).toContain('Above 200');
      expect(byTestId('watchlist-alert-state-AAPL')?.textContent).toContain('Hit 201.25');
      expect(byTestId('watchlist-alert-state-AAPL')?.textContent).toContain(words);
    });

    it('re-arms a fired alert by setting a new one on the entry', async () => {
      await start([alerted(fired(AlertDelivery.HandedOver))]);
      await click('watchlist-alert-AAPL');

      expect(input('watchlist-alert-target').value).toBe('');
      expect(byTestId('watchlist-alert-save')?.textContent).toContain('Set alert');
    });

    it.each([
      ['ALR-409', 409, 'already reached that target'],
      ['ALR-422', 422, 'at most 20 active price alerts'],
    ])('shows %s inside the editor', async (code, status, text) => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await typeTarget('200');
      await submit('watchlist-alert-form-AAPL');

      http
        .expectOne({ method: 'PUT', url: SET_URL })
        .flush({ errorCode: code, message: 'dev text' }, { status, statusText: 'err' });
      await fixture.whenStable();

      await vi.waitFor(() => expect(byTestId('watchlist-alert-error')?.textContent).toContain(text));
      expect(byTestId('watchlist-alert-form-AAPL')).not.toBeNull();
    });

    it('disables Set alert on every entry once the account holds the maximum of active alerts', async () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        item(`S${i}`, { alert: active(AlertDirection.Above, 500) } as Partial<WatchlistItem>),
      );
      await start([list(9, 'Big', [...items, item('NEW')])]);

      expect(byTestId<HTMLButtonElement>('watchlist-alert-set-NEW')!.disabled).toBe(true);
      // An entry that already has an active alert can still be edited: replacing it does not add to the count.
      expect(byTestId<HTMLButtonElement>('watchlist-alert-S0')!.disabled).toBe(false);
    });

    it('cancels the editor without sending anything', async () => {
      await start([list(9, 'Tech', [item('AAPL')])]);
      await click('watchlist-alert-set-AAPL');
      await typeTarget('200');

      root.querySelector<HTMLButtonElement>('.wl-alert-buttons .is-tertiary')!.click();
      await fixture.whenStable();

      expect(byTestId('watchlist-alert-form-AAPL')).toBeNull();
      http.expectNone({ method: 'PUT', url: SET_URL });
    });
  });
});
