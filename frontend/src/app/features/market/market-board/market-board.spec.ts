import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
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
    expect(nvda.textContent).toContain('—');
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

  it('opens the quote dialog for the clicked row', async () => {
    await load();

    byTestId<HTMLButtonElement>('market-row-MSFT')!.click();
    await fixture.whenStable();

    const dialog = byTestId<HTMLDialogElement>('quote-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('#quote-dialog-title')?.textContent).toContain('MSFT');
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
});
