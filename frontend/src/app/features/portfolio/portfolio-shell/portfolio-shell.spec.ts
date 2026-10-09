import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import {
  PORTFOLIO_PERFORMANCE_URL,
  PORTFOLIO_PNL_URL,
  PORTFOLIO_POSITIONS_URL,
  PORTFOLIO_URL,
  PortfolioAnswers,
  answerPortfolio,
  answerPortfolioUnavailable,
  held,
  navPoint,
  performanceBody,
  pnlBody,
  pricedPosition,
  realisedBody,
  summaryBody,
  unpricedPosition,
} from '../../../testing/portfolio-http';
import {
  QUOTES_URL,
  SAMPLE_QUOTES,
  TEST_TOKENS,
  answerLinkedAccount,
  answerUnlinkedAccount,
  orderEntry,
} from '../../../testing/trade-http';
import { provideFakeHighcharts } from '../../../testing/highcharts';
import { stubCandles } from '../../../testing/market-http';
import { PORTFOLIO_ROUTES } from '../portfolio.routes';
import { POSITIONS_VIEW_KEY } from '../portfolio-holdings/portfolio-holdings';

const HELD = [held('AAPL', 10, 228.4), held('GOOGL', 5, 340)];

/** Two buys behind AAPL: 20 at 100 and 30 at 220, which weigh up to 50 at 172. */
const AAPL_ORDERS = [
  { ...orderEntry('1', 'AAPL', 'FILLED', '2026-09-01T10:00:00Z'), quantity: 20, executedPrice: 100 },
  { ...orderEntry('2', 'AAPL', 'FILLED', '2026-09-10T10:00:00Z'), quantity: 30, executedPrice: 220 },
  { ...orderEntry('3', 'AAPL', 'REJECTED', '2026-09-11T10:00:00Z'), quantity: 5, executedPrice: null },
  { ...orderEntry('4', 'MSFT', 'FILLED', '2026-09-02T10:00:00Z'), quantity: 10, executedPrice: 400 },
];

/** The tab each group of tests starts on; a nested describe sets it for its tests. */
let entry = '/portfolio';

describe('Portfolio', () => {
  let fixture: ComponentFixture<unknown>;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const cardSymbols = () =>
    Array.from(root.querySelectorAll('[data-testid="position-card"] .label-symbol')).map((s) => s.textContent?.trim());
  const rowSymbols = () =>
    Array.from(root.querySelectorAll('[data-testid="position-row"] .label-symbol')).map((s) => s.textContent?.trim());
  /** Lets the resources settle, then paints. */
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function start(
    answers: PortfolioAnswers = {},
    positions: readonly unknown[] = HELD,
    orders: readonly unknown[] = [],
  ): Promise<void> {
    await answerLinkedAccount(http, { positions, orders });
    await answerPortfolio(http, answers);
    await render();
  }

  async function showTable(): Promise<void> {
    byTestId<HTMLButtonElement>('positions-view-table')!.click();
    await render();
  }

  async function answerBoard(quotes: readonly unknown[] = SAMPLE_QUOTES): Promise<void> {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush({ quotes, asOf: '2026-10-04T05:00:00Z', stale: false });
    await render();
  }

  function typeInto(testId: string, value: string): void {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function create(): Promise<void> {
    harness = await RouterTestingHarness.create(entry);
    fixture = harness.fixture;
    root = fixture.nativeElement as HTMLElement;
  }

  /** Runs a group of tests on one of the portfolio's tabs. */
  function onTab(path: string): void {
    beforeAll(() => {
      entry = path;
    });
    afterAll(() => {
      entry = '/portfolio';
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([stubCandles])),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([{ path: 'portfolio', loadChildren: () => PORTFOLIO_ROUTES }]),
        ...provideFakeHighcharts(),
      ],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    http = TestBed.inject(HttpTestingController);
    await create();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('shows a spinner until the portfolio has loaded', async () => {
    await answerLinkedAccount(http, { positions: HELD });
    // The request being open is what "loading" means; whenStable would wait for it, so paint without it.
    const summary = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_URL));
    fixture.detectChanges();

    expect(byTestId('portfolio-loading')).not.toBeNull();
    summary.flush(summaryBody());
    http.match(() => true).forEach((request) => request.flush({}));
  });

  describe('summary', () => {
    it('shows the totals: value, cash, market value, unrealised, realised and today', async () => {
      await start();

      expect(text('portfolio-total')).toBe('$5,059.45');
      expect(text('portfolio-cash')).toBe('$1,000.00');
      expect(text('portfolio-market-value')).toBe('$4,059.45');
      expect(text('portfolio-unrealised')).toContain('+$75.45');
      expect(text('portfolio-unrealised')).toContain('(+1.89%)');
      expect(text('portfolio-realised')).toContain('+$100.00');
      expect(text('portfolio-day')).toContain('+$34.45');
      expect(text('portfolio-day')).toContain('(+0.85%)');
    });

    it('says when the prices are from and has no Delayed marker when everything is live', async () => {
      await start();

      expect(text('portfolio-asof')).toContain('Prices as of');
      expect(byTestId('portfolio-delayed')).toBeNull();
    });

    it('shows a missing day figure as unavailable, never as zero', async () => {
      await start({ summary: summaryBody({ dayPnl: null, dayPnlPercent: null }) });

      expect(text('portfolio-day')).toContain('Not available');
      expect(text('portfolio-day')).not.toContain('$0.00');
    });

    it('shows a loss with a minus sign and an arrow, not just a colour', async () => {
      await start({ summary: summaryBody({ unrealisedPnl: -50, unrealisedPnlPercent: -1.25 }) });

      const unrealised = byTestId('portfolio-unrealised')!;
      expect(unrealised.textContent).toContain('-$50.00');
      expect(unrealised.textContent).toContain('(-1.25%)');
      expect(unrealised.querySelector('.fa-arrow-trend-down')).not.toBeNull();
      expect(unrealised.querySelector('.is-loss')).not.toBeNull();
    });

    it('puts the tab bar straight under the tiles, with the overview open, and no other tab loaded', async () => {
      await start();

      const follows = (a: Element | null, b: Element | null) =>
        !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(root.querySelector('.tiles'), byTestId('portfolio-tabs'))).toBe(true);
      expect(follows(byTestId('portfolio-tabs'), byTestId('portfolio-performance'))).toBe(true);
      expect(byTestId('portfolio-holdings-section')).toBeNull();
      expect(byTestId('portfolio-pnl-section')).toBeNull();
    });

    it('has four tabs, each a link, with the open one marked as the current page', async () => {
      await start();

      const tabs = [...root.querySelectorAll<HTMLAnchorElement>('[data-testid="portfolio-tabs"] a')];
      expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Overview', 'Holdings', 'Performance', 'Profit and loss']);
      expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/portfolio', '/portfolio/holdings', '/portfolio/performance', '/portfolio/pnl']);
      expect(tabs.map((tab) => tab.getAttribute('aria-current'))).toEqual(['page', null, null, null]);
      expect(root.querySelector('nav[data-testid="portfolio-tabs"]')?.getAttribute('aria-label')).toBe('Portfolio sections');
    });

    it('keeps the tiles on every tab', async () => {
      await start();
      const total = text('portfolio-total');

      for (const tab of ['holdings', 'performance', 'pnl']) {
        root.querySelector<HTMLAnchorElement>(`[data-testid="portfolio-tab-${tab}"]`)!.click();
        await render();
        expect(text('portfolio-total')).toBe(total);
      }
    });

    it('refreshes the account and every section on request', async () => {
      await start();

      byTestId<HTMLButtonElement>('portfolio-refresh')!.click();
      await answerLinkedAccount(http, { positions: HELD });
      await answerPortfolio(http, { summary: summaryBody({ totalValue: 6000 }) });
      await render();

      expect(text('portfolio-total')).toBe('$6,000.00');
    });

    it('has no separate link to a positions page any more', async () => {
      await start();

      expect(byTestId('portfolio-positions-link')).toBeNull();
    });
  });

  describe('overview', () => {
    it('is the first tab and shows the NAV chart in its compact form, then the allocation, who made the money and what moved', async () => {
      await start();

      expect(byTestId('portfolio-tab-overview')?.getAttribute('aria-current')).toBe('page');
      expect(byTestId('performance-stats')).not.toBeNull();
      expect(byTestId('performance-analysis')).toBeNull();
      const follows = (a: Element | null, b: Element | null) =>
        !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(byTestId('portfolio-performance'), byTestId('allocation-card'))).toBe(true);
      expect(byTestId('contribution-card')).not.toBeNull();
      expect(follows(byTestId('contribution-card'), byTestId('movers-card'))).toBe(true);
    });

    it('states the allocation takeaway, and regroups by currency', async () => {
      await start();

      expect(text('allocation-takeaway')).toBe('Your top 2 holdings are 100% of your portfolio.');
      expect(root.querySelector('[data-testid="allocation-card"] app-donut-chart')).not.toBeNull();

      byTestId<HTMLButtonElement>('allocation-by-currency')!.click();
      await render();

      expect(text('allocation-takeaway')).toBe('100% of your holdings are in USD.');
      expect(byTestId('allocation-by-currency')?.getAttribute('aria-pressed')).toBe('true');
      expect(byTestId('allocation-by-instrument')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('names who made the most money', async () => {
      await start();

      expect(text('contribution-takeaway')).toContain('AAPL made the most');
      expect(text('contribution-takeaway')).toContain('+$143.10');
      expect(root.querySelector('[data-testid="contribution-card"] app-bar-chart')).not.toBeNull();
    });

    it('names the best and the worst when one lost money', async () => {
      await start({
        pnl: pnlBody({
          bySymbol: [
            { symbol: 'AAPL', realisedPnl: 0, unrealisedPnl: 80, totalPnl: 80 },
            { symbol: 'GOOGL', realisedPnl: 0, unrealisedPnl: -25, totalPnl: -25 },
          ],
        }),
      });

      expect(text('contribution-takeaway')).toContain('AAPL made the most');
      expect(text('contribution-takeaway')).toContain('GOOGL lost the most');
      expect(text('contribution-takeaway')).toContain('-$25.00');
    });

    it('names the biggest mover of the day in money and percent, over a treemap', async () => {
      await start();

      expect(text('movers-takeaway')).toContain('Biggest mover: AAPL');
      expect(text('movers-takeaway')).toContain('+$27.10');
      expect(text('movers-takeaway')).toContain('(+1.18%)');
      expect(root.querySelector('[data-testid="movers-card"] app-treemap-chart')).not.toBeNull();
    });

    it('says so, instead of drawing an empty chart, when nothing is priced or earned yet', async () => {
      await start(
        {
          summary: summaryBody({ marketValue: 0, costBasis: 0, positionCount: 0, totalValue: 1000 }),
          positions: [],
          pnl: pnlBody({ bySymbol: [] }),
        },
        [],
      );

      expect(byTestId('allocation-empty')).not.toBeNull();
      expect(byTestId('contribution-empty')).not.toBeNull();
      expect(byTestId('movers-empty')).not.toBeNull();
    });

    it('is the only tab loaded: no holdings, no profit and loss table', async () => {
      await start();

      expect(byTestId('portfolio-holdings-section')).toBeNull();
      expect(byTestId('portfolio-pnl-section')).toBeNull();
    });
  });

  describe('performance tab', () => {
    onTab('/portfolio/performance');

    it('opens the full analysis under the tiles', async () => {
      await start();

      expect(byTestId('portfolio-tab-performance')?.getAttribute('aria-current')).toBe('page');
      expect(byTestId('performance-analysis')).not.toBeNull();
      expect(byTestId('performance-statements')).not.toBeNull();
      expect(byTestId('allocation-card')).toBeNull();
    });
  });

  describe('when prices are not all there', () => {
    onTab('/portfolio/holdings');

    it('marks a stale price Delayed, on the holding and at the top, and still shows the number', async () => {
      await start({
        positions: [pricedPosition('AAPL', { stale: true, priceAsOf: '2026-10-07T09:00:00Z' }), pricedPosition('GOOGL')],
      });

      expect(text('holding-status-AAPL')).toContain('Delayed');
      expect(text('holding-status-AAPL')).toContain('as of');
      expect(text('holding-value-AAPL')).toBe('$2,327.10');
      expect(text('portfolio-delayed')).toBe('Delayed');
      expect(text('holding-status-GOOGL')).toBe('Live');
    });

    it('shows a partial portfolio: the unpriced holding keeps its cost, and the totals say they are understated', async () => {
      await start({
        summary: summaryBody({ partial: true, marketValue: 2327.1, totalValue: 3327.1, positionCount: 2 }),
        positions: [pricedPosition('AAPL'), unpricedPosition('GOOGL', { quantity: 5, averageCost: 340, costBasis: 1700 })],
      });

      expect(text('portfolio-partial')).toContain('1 holding could not be priced');
      expect(text('portfolio-partial')).toContain('understated');
      expect(text('holding-status-GOOGL')).toBe('Unavailable');
      expect(text('holding-value-GOOGL')).toContain('$1,700.00');
      expect(root.querySelectorAll('[data-testid="position-card"]')[1].textContent).toContain('Cost basis');
      expect(text('holding-status-AAPL')).toBe('Live');
      expect(byTestId('portfolio-delayed')).toBeNull();
    });

    it('does not go blank when nothing can be priced: it says so and lists the holdings unpriced', async () => {
      await answerLinkedAccount(http, { positions: HELD, cashBalance: 25000 });
      await answerPortfolioUnavailable(http);
      await render();

      expect(byTestId('portfolio-unavailable')?.getAttribute('role')).toBe('alert');
      expect(text('portfolio-unavailable')).toContain('Prices are unavailable right now');
      expect(text('portfolio-cash')).toBe('$25,000.00');
      expect(text('portfolio-cost')).toBe('$3,984.00');
      expect(text('holding-status-AAPL')).toBe('Unavailable');
      expect(text('holding-status-GOOGL')).toBe('Unavailable');
      expect(byTestId('portfolio-total')).toBeNull();
      expect(byTestId('portfolio-error')).toBeNull();
    });

    it('still shows what was realised when nothing can be priced, because that needs no price', async () => {
      await answerLinkedAccount(http, { positions: HELD });
      await answerPortfolioUnavailable(http, realisedBody({ realisedPnl: -42.5 }));
      await render();

      expect(text('portfolio-realised')).toContain('-$42.50');
      expect(byTestId('portfolio-realised')?.querySelector('.fa-arrow-trend-down')).not.toBeNull();
    });

    it('leaves the realised tile out when even the realised read failed', async () => {
      await answerLinkedAccount(http, { positions: HELD });
      await answerPortfolioUnavailable(http, 'fails');
      await render();

      expect(byTestId('portfolio-unavailable')).not.toBeNull();
      expect(byTestId('portfolio-realised')).toBeNull();
    });

    it('tries again from the unavailable notice', async () => {
      await answerLinkedAccount(http, { positions: HELD });
      await answerPortfolioUnavailable(http);
      await render();

      byTestId<HTMLButtonElement>('portfolio-retry')!.click();
      await answerPortfolio(http);
      await render();

      expect(byTestId('portfolio-unavailable')).toBeNull();
      expect(text('portfolio-total')).toBe('$5,059.45');
    });

    it('shows the reason and a retry when the portfolio cannot be loaded for another reason', async () => {
      await answerLinkedAccount(http, { positions: HELD });
      for (const url of [PORTFOLIO_URL, PORTFOLIO_POSITIONS_URL, PORTFOLIO_PNL_URL, PORTFOLIO_PERFORMANCE_URL]) {
        (await vi.waitFor(() => http.expectOne((r) => r.url === url))).flush(
          { errorCode: 'SRV-500', message: 'x' },
          { status: 500, statusText: 'x' },
        );
      }
      await render();

      expect(byTestId('portfolio-error')?.getAttribute('role')).toBe('alert');
      expect(byTestId('portfolio-unavailable')).toBeNull();
      expect(byTestId('portfolio-performance')).toBeNull();
    });

    it('says there is no portfolio without an account', async () => {
      await answerUnlinkedAccount(http);
      await render();

      expect(byTestId('portfolio-no-account')).not.toBeNull();
      expect(byTestId('portfolio-holdings-section')).toBeNull();
      http.expectNone((r) => r.url.startsWith('/api/v1/portfolio'));
    });
  });

  describe('holdings', () => {
    onTab('/portfolio/holdings');

    it('defaults to cards, sorted by symbol, priced, with the name from the positions the app already has', async () => {
      await start();

      expect(byTestId('positions-card-view')).toBeTruthy();
      expect(byTestId('positions-table-view')).toBeNull();
      expect(cardSymbols()).toEqual(['AAPL', 'GOOGL']);
      expect(byTestId('positions-view-card')?.getAttribute('aria-pressed')).toBe('true');
      expect(byTestId('positions-view-table')?.getAttribute('aria-pressed')).toBe('false');

      const aapl = root.querySelector('[data-testid="position-card"]')!;
      expect(aapl.textContent).toContain('AAPL Inc.');
      expect(aapl.textContent).toContain('$2,327.10');
      expect(aapl.textContent).toContain('+$43.10');
      expect(aapl.textContent).toContain('+$27.10');
      expect(aapl.textContent).toContain('Live');
    });

    it('shows the logo on a card when there is one', async () => {
      await start({}, [held('AAPL', 10, 228.4, '/assets/icons/AAPL.svg'), held('GOOGL', 5, 340)]);

      expect(root.querySelector('[data-testid="position-card"] img')?.getAttribute('src')).toBe('/assets/icons/AAPL.svg');
    });

    it('switches to the table, which adds the price, average cost and status and has no totals row of its own', async () => {
      await start();

      await showTable();

      expect(byTestId('positions-card-view')).toBeNull();
      expect(rowSymbols()).toEqual(['AAPL', 'GOOGL']);
      expect(text('holding-price-AAPL')).toBe('$232.71');
      expect(text('holding-value-AAPL')).toBe('$2,327.10');
      expect(text('holding-status-AAPL')).toBe('Live');
      const row = root.querySelector('[data-testid="position-row"]')!;
      expect(row.textContent).toContain('$228.40');
      expect(row.textContent).toContain('$2,284.00');
      expect(root.querySelector('tfoot')).toBeNull();
      expect(byTestId('positions-view-table')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('shows a holding with no price in the table with its cost and a dash for the value', async () => {
      await start({
        summary: summaryBody({ partial: true }),
        positions: [pricedPosition('AAPL'), unpricedPosition('GOOGL', { quantity: 5, averageCost: 340, costBasis: 1700 })],
      });

      await showTable();

      expect(text('holding-price-GOOGL')).toBe('No price');
      expect(text('holding-value-GOOGL')).toContain('Not available');
      expect(root.querySelector('[data-testid="position-row"]:nth-child(2)')?.textContent).toContain('$1,700.00');
      expect(text('holding-status-GOOGL')).toBe('Unavailable');
    });

    it('remembers the chosen view for next time', async () => {
      await start();
      await showTable();
      expect(localStorage.getItem(POSITIONS_VIEW_KEY)).toBe('table');

      // Leave the tab and come back: a new Holdings component reads the choice that was kept.
      await harness.navigateByUrl('/portfolio');
      await render();
      expect(byTestId('positions-table-view')).toBeNull();
      await harness.navigateByUrl('/portfolio/holdings');
      await render();

      expect(byTestId('positions-table-view')).toBeTruthy();
    });

    it('gives the table a caption and column headers for assistive technology', async () => {
      await start();
      await showTable();

      const table = byTestId('positions-table-view')!.querySelector('table')!;
      expect(table.querySelector('caption')?.textContent).toContain('Holdings');
      expect(Array.from(table.querySelectorAll('thead th')).every((th) => th.getAttribute('scope') === 'col')).toBe(true);
      expect(table.querySelectorAll('tbody th[scope="row"]').length).toBe(2);
    });

    it('pages through more than ten holdings and offers other page sizes', async () => {
      const symbols = Array.from({ length: 12 }, (_, i) => `S${String(i).padStart(2, '0')}`);
      await start({ positions: symbols.map((symbol) => pricedPosition(symbol)) }, symbols.map((symbol) => held(symbol, 10, 228.4)));

      expect(cardSymbols()).toHaveLength(10);
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

    it('handles an account with no holdings: cash only, with a way to find an instrument', async () => {
      await start(
        {
          summary: summaryBody({
            marketValue: 0,
            costBasis: 0,
            unrealisedPnl: 0,
            unrealisedPnlPercent: null,
            totalValue: 1000,
            positionCount: 0,
            dayPnl: null,
            dayPnlPercent: null,
          }),
          positions: [],
          pnl: pnlBody({ bySymbol: [] }),
        },
        [],
      );

      expect(byTestId('portfolio-empty')).not.toBeNull();
      expect(byTestId('positions-card-view')).toBeNull();
      expect(byTestId('positions-view-card')).toBeNull();
      expect(text('portfolio-total')).toBe('$1,000.00');
      expect(text('portfolio-day')).toContain('Not available');
    });
  });

  describe('holdings: opening one from a link', () => {
    describe('with a symbol that is held', () => {
      onTab('/portfolio/holdings?symbol=GOOGL');

      it('opens that holding straight away', async () => {
        await start();

        expect(root.querySelector('#detail-title')?.textContent).toContain('GOOGL');
      });
    });

    describe('with a symbol that is not held', () => {
      onTab('/portfolio/holdings?symbol=NOPE');

      it('just shows the holdings', async () => {
        await start();

        expect(root.querySelector('#detail-title')).toBeNull();
        expect(cardSymbols()).toEqual(['AAPL', 'GOOGL']);
      });
    });
  });

  describe('position detail', () => {
    onTab('/portfolio/holdings');

    const POSITIONS = [held('MSFT', 10, 400), held('AAPL', 50, 175, '/assets/icons/AAPL.svg')];
    const PRICED = [pricedPosition('MSFT', { quantity: 10, averageCost: 400, costBasis: 4000 }), pricedPosition('AAPL', { quantity: 50, averageCost: 175, costBasis: 8750 })];
    const dialog = () => byTestId<HTMLDialogElement>('position-dialog')!;
    const openFirstCard = async () => {
      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();
    };

    it('opens from a card with the quantity, average cost and the buys that add up to the holding', async () => {
      await start({ positions: PRICED }, POSITIONS, AAPL_ORDERS);

      await openFirstCard();

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
      await start({ positions: PRICED }, POSITIONS, AAPL_ORDERS);
      await showTable();

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
      await start({ positions: [pricedPosition('AAPL', { quantity: 50, averageCost: 100, costBasis: 5000 })] }, [held('AAPL', 50, 100)], orders);

      await openFirstCard();

      const explainer = byTestId('position-dialog-explainer')?.textContent ?? '';
      expect(explainer).toContain('You have sold 5 since');
      expect(explainer).toContain('Some older orders may not appear');
    });

    it('says so when no filled buys are on record', async () => {
      await start({ positions: PRICED }, POSITIONS, []);

      await openFirstCard();

      expect(byTestId('position-dialog-no-lots')).toBeTruthy();
      expect(byTestId('position-lots')).toBeNull();
    });

    it('also opens when prices are down, so a holding can still be traded', async () => {
      await answerLinkedAccount(http, { positions: POSITIONS, orders: AAPL_ORDERS });
      await answerPortfolioUnavailable(http);
      await render();

      await openFirstCard();

      expect(dialog().open).toBe(true);
      expect(byTestId('position-lots')).toBeTruthy();
    });

    it.each([
      ['position-buy', 'Place buy order'],
      ['position-sell', 'Place sell order'],
    ])('%s loads the live price and opens the shared order ticket', async (button, submitLabel) => {
      await start({ positions: PRICED }, POSITIONS, AAPL_ORDERS);
      await openFirstCard();

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
      await start({ positions: PRICED }, POSITIONS, AAPL_ORDERS);
      await openFirstCard();
      byTestId<HTMLButtonElement>('position-buy')!.click();
      await answerBoard();

      byTestId<HTMLButtonElement>('order-back')!.click();
      await render();

      expect(byTestId('order-ticket')).toBeNull();
      expect(byTestId('position-lots')).toBeTruthy();
    });

    it('says so when the instrument is not on the market board any more', async () => {
      await start({ positions: [pricedPosition('OLD1')] }, [held('OLD1', 3, 10)]);
      await openFirstCard();

      byTestId<HTMLButtonElement>('position-sell')!.click();
      await answerBoard();

      expect(byTestId('position-dialog-untradable')?.textContent).toContain('OLD1 is not available to trade right now');
      expect(byTestId('order-ticket')).toBeNull();
    });

    it('shows the reason with a retry when the live price cannot be loaded', async () => {
      await start({ positions: PRICED }, POSITIONS, AAPL_ORDERS);
      await openFirstCard();

      byTestId<HTMLButtonElement>('position-buy')!.click();
      (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush(null, { status: 503, statusText: 'x' });
      await render();
      expect(byTestId('position-dialog-error')?.textContent).toContain('unavailable right now');

      root.querySelector<HTMLButtonElement>('[data-testid="position-dialog-error"] .is-primary')!.click();
      await answerBoard();
      expect(byTestId('order-ticket')).toBeTruthy();
    });
  });

  describe('on a wide screen, with a holding open', () => {
    onTab('/portfolio/holdings');

    const POSITIONS = [held('MSFT', 10, 400), held('AAPL', 50, 175)];
    const PRICED = [pricedPosition('MSFT', { quantity: 10, averageCost: 400, costBasis: 4000 }), pricedPosition('AAPL', { quantity: 50, averageCost: 175, costBasis: 8750 })];

    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined })),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it('shrinks the card list to one column of small cards while a detail is open, and restores it on close', async () => {
      await start({ positions: PRICED }, POSITIONS);
      expect(root.querySelector('.position-grid')!.classList.contains('is-compact')).toBe(false);

      root.querySelector<HTMLButtonElement>('[data-testid="position-card"]')!.click();
      await render();
      expect(root.querySelector('.position-grid')!.classList.contains('is-compact')).toBe(true);
      expect(root.querySelector('[data-testid="pagination-page-size"]')).toBeNull();

      byTestId<HTMLButtonElement>('position-dialog-close')!.click();
      await render();
      expect(root.querySelector('.position-grid')!.classList.contains('is-compact')).toBe(false);
    });

    it('shrinks the table to the instrument column while a detail is open', async () => {
      await start({ positions: PRICED }, POSITIONS);
      await showTable();
      expect(root.querySelector('[data-testid="positions-table-view"] table')!.classList.contains('is-compact')).toBe(false);

      root.querySelector<HTMLElement>('[data-testid="position-row"]')!.click();
      await render();

      expect(root.querySelector('[data-testid="positions-table-view"] table')!.classList.contains('is-compact')).toBe(true);
      expect(root.querySelector('tr.is-selected .label-symbol')?.textContent).toContain('AAPL');
    });
  });

  describe('profit and loss by instrument', () => {
    onTab('/portfolio/pnl');

    it('draws what has been banked over time, with a sentence, from the closed-day history', async () => {
      await start({
        performance: performanceBody({
          points: [
            navPoint('2026-09-01', 1000, 10000, { netFlow: 10000, realisedPnlCumulative: 0 }),
            navPoint('2026-09-02', 1010, 10100, { realisedPnlCumulative: 25 }),
            navPoint('2026-09-03', 1020, 10200, { realisedPnlCumulative: 80 }),
          ],
        }),
      });

      expect(text('portfolio-realised-takeaway')).toContain('Banked so far:');
      expect(text('portfolio-realised-takeaway')).toContain('+$80.00');
      expect(root.querySelector('[data-testid="portfolio-realised-history"] app-line-chart')).not.toBeNull();
    });

    it('leaves the banked-over-time chart out until there are two closed days', async () => {
      await start({ performance: performanceBody({ points: [navPoint('2026-09-01', 1000, 10000)] }) });

      expect(byTestId('portfolio-realised-history')).toBeNull();
    });

    it('offers the table as a CSV file, as it is shown', async () => {
      const createObjectURL = vi.fn(() => 'blob:csv');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      await start();

      byTestId<HTMLButtonElement>('portfolio-pnl-export')!.click();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
      expect(await blob.text()).toContain('"AAPL",100.00,43.10,143.10');
      expect(click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
      click.mockRestore();
    });

    it('has no download button when there is nothing to download', async () => {
      await start({ pnl: pnlBody({ bySymbol: [] }) }, []);

      expect(byTestId('portfolio-pnl-export')).toBeNull();
    });

    it('says there is nothing to show yet when no instrument has a result', async () => {
      await start({ pnl: pnlBody({ bySymbol: [] }) }, []);

      expect(text('portfolio-breakdown-empty')).toContain('No profit or loss');
    });

    it('says the breakdown needs prices when nothing can be priced, and still has the realised history', async () => {
      await answerLinkedAccount(http, { positions: HELD });
      await answerPortfolioUnavailable(http);
      await render();

      expect(text('portfolio-pnl-unavailable')).toContain('needs prices');
    });

    it('breaks the profit and loss down by instrument', async () => {
      await start();

      expect(text('pnl-AAPL')).toContain('+$100.00');
      expect(text('pnl-AAPL')).toContain('+$43.10');
      expect(text('pnl-AAPL')).toContain('+$143.10');
      expect(text('pnl-GOOGL')).toContain('+$32.35');
    });

    it('bounds the realised figure by the chosen dates and can clear them', async () => {
      await start();

      typeInto('portfolio-from', '2026-09-01');
      typeInto('portfolio-to', '2026-10-19');
      fixture.detectChanges();
      byTestId<HTMLButtonElement>('portfolio-range-apply')!.click();
      const pnl = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL));
      pnl.flush(pnlBody());
      await render();

      expect(pnl.request.params.get('from')).toBe('2026-09-01');
      expect(pnl.request.params.get('to')).toBe('2026-10-19');
      expect(byTestId('portfolio-range-clear')).not.toBeNull();

      byTestId<HTMLButtonElement>('portfolio-range-clear')!.click();
      const cleared = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL));
      cleared.flush(pnlBody());
      await render();

      expect(cleared.request.params.has('from')).toBe(false);
      expect(byTestId('portfolio-range-clear')).toBeNull();
    });

    it('reloads only this section when the filter is applied: its own spinner, and the rest of the page stays put', async () => {
      await start();

      typeInto('portfolio-from', '2026-09-01');
      fixture.detectChanges();
      byTestId<HTMLButtonElement>('portfolio-range-apply')!.click();
      const pnl = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL));
      fixture.detectChanges();

      expect(byTestId('portfolio-pnl-section')?.getAttribute('aria-busy')).toBe('true');
      expect(byTestId('portfolio-pnl-section')?.querySelector('app-spinner')).not.toBeNull();
      expect(byTestId('portfolio-pnl-loading')).not.toBeNull();
      // The old breakdown is not left standing under a new filter; everything else is still there, with no spinner of its own.
      expect(byTestId('pnl-AAPL')).toBeNull();
      expect(byTestId('portfolio-loading')).toBeNull();
      expect(text('portfolio-total')).toBe('$5,059.45');
      http.expectNone((r) => r.url !== PORTFOLIO_PNL_URL && r.url.startsWith('/api/v1/portfolio'));

      pnl.flush(pnlBody({ bySymbol: [{ symbol: 'AAPL', realisedPnl: 10, unrealisedPnl: 43.1, totalPnl: 53.1 }] }));
      await render();

      expect(byTestId('portfolio-pnl-section')?.getAttribute('aria-busy')).toBe('false');
      expect(text('pnl-AAPL')).toContain('+$53.10');
      expect(byTestId('pnl-GOOGL')).toBeNull();
    });

    it('shows the reason and a retry for this section alone when it cannot be read', async () => {
      await start();

      typeInto('portfolio-from', '2026-09-01');
      fixture.detectChanges();
      byTestId<HTMLButtonElement>('portfolio-range-apply')!.click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL))).flush(
        { errorCode: 'SRV-500', message: 'x' },
        { status: 500, statusText: 'x' },
      );
      await render();

      expect(byTestId('portfolio-pnl-error')?.getAttribute('role')).toBe('alert');
      expect(text('portfolio-total')).toBe('$5,059.45');

      byTestId('portfolio-pnl-error')!.querySelector<HTMLButtonElement>('button')!.click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PNL_URL))).flush(pnlBody());
      await render();
      expect(byTestId('portfolio-pnl-error')).toBeNull();
      expect(text('pnl-AAPL')).toContain('+$143.10');
    });

    it('refuses a start date after the end date, says why, and asks for nothing', async () => {
      await start();

      typeInto('portfolio-from', '2026-10-19');
      typeInto('portfolio-to', '2026-09-01');
      fixture.detectChanges();

      expect(text('portfolio-range-error')).toBe('The start date must not be after the end date.');
      expect(byTestId('portfolio-to')?.getAttribute('aria-invalid')).toBe('true');
      expect(byTestId<HTMLButtonElement>('portfolio-range-apply')!.disabled).toBe(true);
      http.expectNone((r) => r.url.startsWith('/api/v1/portfolio'));
    });
  });
});
