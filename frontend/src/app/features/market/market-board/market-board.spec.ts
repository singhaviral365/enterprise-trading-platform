import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideApiClients } from '../../../api/api.config';
import { PreferencesStore } from '../../../core/preferences.store';
import { QUOTES_URL, SAMPLE_QUOTES } from '../../../testing/trade-http';
import { MarketBoardPanel } from './market-board';

const BOARD = { quotes: SAMPLE_QUOTES, asOf: '2026-10-01T10:00:00Z', stale: false };

describe('MarketBoardPanel', () => {
  let fixture: ComponentFixture<MarketBoardPanel>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const symbols = () =>
    Array.from(root.querySelectorAll('.market-row .ticker')).map((t) => t.textContent?.trim());

  async function load(board: object = BOARD): Promise<void> {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush(board);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketBoardPanel],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketBoardPanel);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('shows a spinner while the first quotes load', async () => {
    await vi.waitFor(() => fixture.detectChanges());

    expect(root.textContent).toContain('Loading market data');
    http.expectOne(QUOTES_URL).flush(BOARD);
  });

  it('lists the first page of instruments with price, change and previous close', async () => {
    await load();

    expect(symbols()).toEqual(['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN']);
    expect(byTestId('pagination-range')?.textContent).toContain('1-5 of 7');
    const aapl = root.querySelector('.market-row')!;
    expect(aapl.classList.contains('is-up')).toBe(true);
    expect(aapl.textContent).toContain('$200.00');
    expect(aapl.textContent).toContain('+1.50');
    expect(aapl.textContent).toContain('0.75%');
    expect(byTestId('market-prev-close-AAPL')?.textContent).toContain('$198.50');
    expect(root.querySelectorAll('.market-row')[1].classList.contains('is-down')).toBe(true);
  });

  it('says so when an instrument has no quote or no change data', async () => {
    await load();

    const nvda = byTestId('market-row-NVDA')!.closest('tr')!;
    expect(nvda.textContent).toContain('No quote');
    expect(nvda.textContent).toContain('-');
  });

  it('shows a Live badge normally and Delayed when the executor serves a stale snapshot', async () => {
    await load();
    expect(root.querySelector('.badge.is-live')).toBeTruthy();
    expect(byTestId('market-delayed')).toBeNull();

    fixture.destroy();
    fixture = TestBed.createComponent(MarketBoardPanel);
    root = fixture.nativeElement as HTMLElement;
    await load({ ...BOARD, stale: true });
    expect(byTestId('market-delayed')).toBeTruthy();
  });

  it('pages through the instruments', async () => {
    await load();

    root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
    await fixture.whenStable();

    expect(symbols()).toEqual(['GOOG', 'META']);
    expect(byTestId('pagination-range')?.textContent).toContain('6-7 of 7');
  });

  it('changes the page size, returns to page 1 and ignores unknown sizes', async () => {
    await load();
    root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
    await fixture.whenStable();

    const select = root.querySelector<HTMLSelectElement>('[data-testid="pagination-page-size"] select')!;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(symbols()).toHaveLength(7);
    expect(byTestId('pagination-range')?.textContent).toContain('1-7 of 7');

    select.innerHTML += '<option value="99">99</option>';
    select.value = '99';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(symbols()).toHaveLength(7);
  });

  it('opens the quote detail for the clicked row', async () => {
    await load();

    byTestId<HTMLButtonElement>('market-row-MSFT')!.click();
    // the detail asks for the instrument's price history; no candles keeps Highcharts out of this test
    (await vi.waitFor(() => http.expectOne('/api/v1/market/candles/MSFT'))).flush({
      symbol: 'MSFT',
      currency: 'USD',
      interval: '1d',
      candles: [],
    });
    await fixture.whenStable();

    const dialog = byTestId<HTMLDialogElement>('quote-detail')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('#detail-title')?.textContent).toContain('MSFT');
    const selected = root.querySelectorAll('tr.market-row.is-selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('MSFT');
  });

  it('says so when no instruments are available', async () => {
    await load({ ...BOARD, quotes: [] });

    expect(root.textContent).toContain('No instruments are available to trade yet.');
    expect(byTestId('market-table')).toBeNull();
  });

  it('shows the reason with a retry when the first load fails, and recovers', async () => {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush(null, { status: 503, statusText: 'x' });
    await fixture.whenStable();

    expect(byTestId('market-error')?.textContent).toContain('unavailable right now');

    root.querySelector<HTMLButtonElement>('[data-testid="market-error"] button')!.click();
    await load();
    expect(byTestId('market-error')).toBeNull();
    expect(symbols()).toHaveLength(5);
  });

  it('keeps the last prices on screen when a refresh fails', async () => {
    await load();

    root.querySelector<HTMLButtonElement>('button[aria-label="Refresh market data"]')!.click();
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush(null, { status: 500, statusText: 'x' });
    await fixture.whenStable();

    expect(symbols()).toHaveLength(5);
    expect(root.textContent).toContain('Showing the last prices we received.');
  });

  it('refreshes by itself on a timer and stops when destroyed', async () => {
    fixture.destroy();
    vi.useFakeTimers();
    try {
      const timed = TestBed.createComponent(MarketBoardPanel);
      timed.detectChanges();
      await vi.advanceTimersByTimeAsync(1);
      http.expectOne(QUOTES_URL).flush(BOARD);

      await vi.advanceTimersByTimeAsync(30_000);
      http.expectOne(QUOTES_URL).flush(BOARD);

      timed.destroy();
      await vi.advanceTimersByTimeAsync(60_000);
      http.expectNone(QUOTES_URL);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('on a wide screen, with a quote open', () => {
    let assistantOn: ReturnType<typeof signal<boolean>>;
    let resize: (width: number) => void;

    async function openWide(on: boolean, width: number): Promise<void> {
      fixture.destroy();
      assistantOn = signal(on);
      const observers = new Set<(entries: { contentRect: { width: number } }[]) => void>();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
            observers.add(callback);
          }
          observe(): void {}
          disconnect(): void {}
        },
      );
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })),
      );
      resize = (w) => observers.forEach((callback) => callback([{ contentRect: { width: w } }]));
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [MarketBoardPanel],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideApiClients(),
          { provide: PreferencesStore, useValue: { aiAssistantEnabled: assistantOn } },
        ],
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(MarketBoardPanel);
      root = fixture.nativeElement as HTMLElement;
      await load();
      byTestId<HTMLButtonElement>('market-row-MSFT')!.click();
      (await vi.waitFor(() => http.expectOne('/api/v1/market/candles/MSFT'))).flush({
        symbol: 'MSFT',
        currency: 'USD',
        interval: '1d',
        candles: [],
      });
      resize(width);
      await fixture.whenStable();
    }

    afterEach(() => vi.unstubAllGlobals());

    it('shrinks the list to the instrument column, with a compact footer', async () => {
      await openWide(false, 1200);

      expect(root.querySelector('table.row-table')!.classList.contains('is-compact')).toBe(true);
      expect(root.querySelector('.board-card')!.classList.contains('is-compact')).toBe(true);
      expect(root.querySelector('[data-testid="pagination-compact"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="pagination-page-size"]')).toBeNull();
    });

    it('puts the chat in its own pane on the right, not inside the quote, when the assistant is on and there is room', async () => {
      await openWide(true, 1200);

      expect(root.querySelector('[data-testid="split-aside"] [data-testid="assistant-chat"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="quote-detail"] [data-testid="assistant-chat"]')).toBeNull();
      expect(root.querySelector('[data-testid="assistant-chat-symbol"]')?.textContent).toBe('MSFT');
    });

    it('falls back to the chat inside the quote when the container is too narrow for the pane', async () => {
      await openWide(true, 900);

      expect(root.querySelector('[data-testid="split-aside"] [data-testid="assistant-chat"]')).toBeNull();
      expect(root.querySelector('[data-testid="quote-detail"] [data-testid="assistant-chat"]')).not.toBeNull();
    });

    it('has no chat anywhere while the assistant is off, and keeps the list compact', async () => {
      await openWide(false, 1400);

      expect(root.querySelector('[data-testid="assistant-chat"]')).toBeNull();
      expect(root.querySelector('table.row-table')!.classList.contains('is-compact')).toBe(true);
    });

    it('brings the full table back when the quote is closed', async () => {
      await openWide(true, 1200);

      byTestId<HTMLButtonElement>('quote-close')!.click();
      await fixture.whenStable();

      expect(root.querySelector('table.row-table')!.classList.contains('is-compact')).toBe(false);
      expect(root.querySelector('[data-testid="pagination-page-size"]')).not.toBeNull();
    });
  });
});
