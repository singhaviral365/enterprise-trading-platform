import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../api/api.config';
import { SessionService } from '../../core/session.service';
import { QUOTES_URL, SAMPLE_QUOTES, answerLinkedAccount, orderEntry } from '../../testing/trade-http';
import { POSITIONS_VIEW_KEY, Positions } from './positions';

const position = (symbol: string, quantity: number, averageCost: number, iconUrl: string | null = null) => ({
  accountId: 1001,
  symbol,
  instrumentName: `${symbol} Inc.`,
  iconUrl,
  quantity,
  averageCost,
});

const HELD = [position('MSFT', 10, 400), position('AAPL', 50, 175, '/assets/icons/AAPL.svg')];

/** Two buys behind AAPL: 20 at 100 and 30 at 220, which weigh up to 50 at 172. */
const AAPL_ORDERS = [
  { ...orderEntry('1', 'AAPL', 'FILLED', '2026-09-01T10:00:00Z'), quantity: 20, executedPrice: 100 },
  { ...orderEntry('2', 'AAPL', 'FILLED', '2026-09-10T10:00:00Z'), quantity: 30, executedPrice: 220 },
  { ...orderEntry('3', 'AAPL', 'REJECTED', '2026-09-11T10:00:00Z'), quantity: 5, executedPrice: null },
  { ...orderEntry('4', 'MSFT', 'FILLED', '2026-09-02T10:00:00Z'), quantity: 10, executedPrice: 400 },
];

describe('Positions', () => {
  let fixture: ComponentFixture<Positions>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const cardSymbols = () => Array.from(root.querySelectorAll('[data-testid="position-card"] .label-symbol')).map((s) => s.textContent?.trim());
  const rowSymbols = () =>
    Array.from(root.querySelectorAll('[data-testid="position-row"] .label-symbol')).map((s) => s.textContent?.trim());
  /** Lets the resource settle, then paints it. */
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function start(positions: unknown[], orders: unknown[] = []): Promise<void> {
    await answerLinkedAccount(http, { positions, orders });
    await render();
  }

  async function answerBoard(quotes: readonly unknown[] = SAMPLE_QUOTES): Promise<void> {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush({ quotes, asOf: '2026-10-04T05:00:00Z', stale: false });
    await render();
  }

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(Positions);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Positions],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    await create();
  });

  describe('views', () => {
    it('defaults to cards, sorted by symbol, with the total cost basis', async () => {
      await start(HELD);

      expect(byTestId('positions-card-view')).toBeTruthy();
      expect(byTestId('positions-table-view')).toBeNull();
      expect(cardSymbols()).toEqual(['AAPL', 'MSFT']);
      expect(byTestId('positions-total')?.textContent).toContain('12,750.00');
      expect(byTestId('positions-summary')?.textContent).toContain('2 positions');
      expect(byTestId('positions-view-card')?.getAttribute('aria-pressed')).toBe('true');
      expect(byTestId('positions-view-table')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('shows only the symbol, name and cost basis on a card, with the logo when there is one', async () => {
      await start(HELD);

      const card = root.querySelector('[data-testid="position-card"]')!;
      expect(card.textContent).toContain('AAPL');
      expect(card.textContent).toContain('AAPL Inc.');
      expect(card.textContent).toContain('$8,750.00');
      expect(card.textContent).not.toContain('175');
      expect(card.querySelector('img')?.getAttribute('src')).toBe('/assets/icons/AAPL.svg');
    });

    it('switches to the table, which lists quantity, average cost, cost basis and a total', async () => {
      await start(HELD);

      byTestId<HTMLButtonElement>('positions-view-table')!.click();
      await render();

      expect(byTestId('positions-card-view')).toBeNull();
      expect(rowSymbols()).toEqual(['AAPL', 'MSFT']);
      const aapl = root.querySelector('[data-testid="position-row"]')!;
      expect(aapl.textContent).toContain('AAPL Inc.');
      expect(aapl.textContent).toContain('$175.00');
      expect(aapl.textContent).toContain('$8,750.00');
      expect(byTestId('positions-total')?.textContent).toContain('12,750.00');
      expect(byTestId('positions-view-table')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('remembers the chosen view for next time', async () => {
      await start(HELD);
      byTestId<HTMLButtonElement>('positions-view-table')!.click();
      await render();
      expect(localStorage.getItem(POSITIONS_VIEW_KEY)).toBe('table');

      // The account store is a root service, so the second page instance reuses what it already loaded.
      fixture.destroy();
      await create();
      await render();

      expect(byTestId('positions-table-view')).toBeTruthy();
    });

    it('pages through more than ten positions, keeps the total across all of them and offers other page sizes', async () => {
      const many = Array.from({ length: 12 }, (_, i) => position(`S${String(i).padStart(2, '0')}`, 1, 10));
      await start(many);

      expect(cardSymbols()).toHaveLength(10);
      expect(byTestId('positions-total')?.textContent).toContain('120.00');
      expect(byTestId('pagination-range')?.textContent).toContain('1-10 of 12');

      root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
      await render();
      expect(cardSymbols()).toEqual(['S10', 'S11']);

      const select = root.querySelector<HTMLSelectElement>('[data-testid="pagination-page-size"] select')!;
      select.value = '20';
      select.dispatchEvent(new Event('change'));
      await render();
      expect(cardSymbols()).toHaveLength(12);
    });

    it('handles an account with no positions', async () => {
      await start([]);

      expect(byTestId('positions-empty')?.textContent).toContain("don't hold any positions");
      expect(root.querySelector('table')).toBeNull();
      expect(byTestId('positions-card-view')).toBeNull();
    });
  });

  describe('position dialog', () => {
    const dialog = () => byTestId<HTMLDialogElement>('position-dialog')!;

    it('opens from a card with the quantity, average cost and the buys that add up to the holding', async () => {
      await start(HELD, AAPL_ORDERS);

      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      expect(dialog().open).toBe(true);
      expect(root.querySelector('#detail-title')?.textContent).toContain('AAPL');
      expect(byTestId('position-dialog-stats')?.textContent).toContain('$8,750.00');
      expect(byTestId('position-dialog-quantity')?.textContent).toContain('50');
      expect(byTestId('position-dialog-average')?.textContent).toContain('$175.00');

      const lots = Array.from(root.querySelectorAll('[data-testid="position-lot"]'));
      expect(lots).toHaveLength(2);
      expect(lots[0].textContent).toContain('20');
      expect(lots[0].textContent).toContain('$2,000.00');
      expect(lots[1].textContent).toContain('$6,600.00');
      expect(byTestId('position-lots-quantity')?.textContent).toContain('50');
      expect(byTestId('position-lots-cost')?.textContent).toContain('$8,600.00');
      expect(byTestId('position-lots-average')?.textContent).toContain('$172.00');
      expect(byTestId('position-dialog-explainer')?.textContent).toContain('$8,600.00 ÷ 50 = $172.00');
    });

    it('opens from a table row, by click or by keyboard', async () => {
      await start(HELD, AAPL_ORDERS);
      byTestId<HTMLButtonElement>('positions-view-table')!.click();
      await render();

      root.querySelector<HTMLElement>('[data-testid="position-row"]')!.click();
      await render();
      expect(dialog().open).toBe(true);
      expect(root.querySelector('#detail-title')?.textContent).toContain('AAPL');

      byTestId<HTMLButtonElement>('position-dialog-close')!.click();
      await render();
      expect(dialog().open).toBe(false);

      const second = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="position-row"]'))[1];
      second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await render();
      expect(root.querySelector('#detail-title')?.textContent).toContain('MSFT');
    });

    it('explains sells and warns when older orders are missing from the history', async () => {
      const orders = [
        { ...orderEntry('1', 'AAPL', 'FILLED', '2026-09-01T10:00:00Z'), quantity: 20, executedPrice: 100 },
        { ...orderEntry('2', 'AAPL', 'FILLED', '2026-09-02T10:00:00Z', 'SELL'), quantity: 5, executedPrice: 130 },
      ];
      await start([position('AAPL', 50, 100)], orders);

      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      const text = byTestId('position-dialog-explainer')?.textContent ?? '';
      expect(text).toContain('You have sold 5 since');
      expect(text).toContain('Some older orders may not appear');
    });

    it('says so when no filled buys are on record', async () => {
      await start(HELD, []);

      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      expect(byTestId('position-dialog-no-lots')).toBeTruthy();
      expect(byTestId('position-lots')).toBeNull();
    });

    it.each([
      ['position-buy', 'Place buy order'],
      ['position-sell', 'Place sell order'],
    ])('%s loads the live price and opens the shared order ticket', async (button, submitLabel) => {
      await start(HELD, AAPL_ORDERS);
      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      byTestId<HTMLButtonElement>(button)!.click();
      // The request is still open here, so the page is not "stable"; just paint what is on screen.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(byTestId('position-dialog-loading')).toBeTruthy();
      });

      await answerBoard();

      expect(byTestId('order-ticket')).toBeTruthy();
      expect(byTestId('order-submit')?.textContent).toContain(submitLabel);
    });

    it('goes back from the ticket to the details', async () => {
      await start(HELD, AAPL_ORDERS);
      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();
      byTestId<HTMLButtonElement>('position-buy')!.click();
      await answerBoard();

      byTestId<HTMLButtonElement>('order-back')!.click();
      await render();

      expect(byTestId('order-ticket')).toBeNull();
      expect(byTestId('position-lots')).toBeTruthy();
    });

    it('says so when the instrument is not on the market board any more', async () => {
      await start([position('OLD1', 3, 10)]);
      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      byTestId<HTMLButtonElement>('position-sell')!.click();
      await answerBoard();

      expect(byTestId('position-dialog-untradable')?.textContent).toContain('OLD1 is not available to trade right now');
      expect(byTestId('order-ticket')).toBeNull();
    });

    it('shows the reason with a retry when the live price cannot be loaded', async () => {
      await start(HELD, AAPL_ORDERS);
      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();

      byTestId<HTMLButtonElement>('position-buy')!.click();
      (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush(null, { status: 503, statusText: 'x' });
      await render();
      expect(byTestId('position-dialog-error')?.textContent).toContain('unavailable right now');

      root.querySelector<HTMLButtonElement>('[data-testid="position-dialog-error"] .is-primary')!.click();
      await answerBoard();
      expect(byTestId('order-ticket')).toBeTruthy();
    });
  });
});
