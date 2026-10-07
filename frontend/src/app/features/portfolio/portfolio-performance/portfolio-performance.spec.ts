import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import {
  PORTFOLIO_PERFORMANCE_URL,
  answerPortfolio,
  navPoint,
  performanceBody,
} from '../../../testing/portfolio-http';
import { TEST_TOKENS, answerLinkedAccount } from '../../../testing/trade-http';
import { PortfolioPerformance } from './portfolio-performance';

/** Sixty closed days, 1000 rising by one a day, so every range has something to show. */
const longHistory = () => {
  const start = Date.parse('2026-08-01T00:00:00Z');
  const points = Array.from({ length: 60 }, (_, i) =>
    navPoint(new Date(start + i * 86_400_000).toISOString().slice(0, 10), 1000 + i, 10_000 + i * 10, {
      netFlow: i === 0 ? 10_000 : 0,
      dayPnl: i === 0 ? 0 : 10,
    }),
  );
  return performanceBody({ points, availableFrom: points[0].date });
};

describe('PortfolioPerformance', () => {
  let fixture: ComponentFixture<PortfolioPerformance>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function start(performance: object = performanceBody()): Promise<void> {
    await answerLinkedAccount(http);
    await answerPortfolio(http, { performance });
    await render();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortfolioPerformance],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PortfolioPerformance);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('says it is loading until the history arrives', async () => {
    await answerLinkedAccount(http);
    const request = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL));
    fixture.detectChanges();

    expect(byTestId('performance-loading')).not.toBeNull();
    request.flush(performanceBody());
    http.match(() => true).forEach((pending) => pending.flush({}));
  });

  it('shows the range figures: return, profit, drawdown and the best and worst day', async () => {
    await start();

    expect(text('performance-return')).toContain('+10.00%');
    expect(text('performance-pnl')).toContain('+$1,000.00');
    expect(text('performance-drawdown')).toContain('0.00%');
    expect(text('performance-best')).toContain('+5.00%');
    expect(text('performance-worst')).toContain('+4.76%');
    expect(byTestId('performance-annualised')).toBeNull();
    expect(root.querySelector('app-line-chart')).not.toBeNull();
  });

  it('describes the chart for assistive technology, with the figures beside it', async () => {
    await start();

    const label = root.querySelector('app-line-chart [role="img"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('from 2026-09-01 to 2026-09-03');
    expect(label).toContain('up 10.00 per cent');
  });

  it('changes the range without asking the server again', async () => {
    await start(longHistory());
    expect(text('performance-statements')).toContain('60 days');

    byTestId<HTMLButtonElement>('performance-range-1M')!.click();
    await render();

    expect(byTestId('performance-range-1M')?.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId('performance-range-All')?.getAttribute('aria-pressed')).toBe('false');
    expect(text('performance-statements')).toContain('31 days');
    http.expectNone((r) => r.url.startsWith('/api/v1/portfolio'));
  });

  it('lists the daily statements newest first and offers the rest on request', async () => {
    await start(longHistory());

    const rows = root.querySelectorAll('[data-testid="performance-statements"] tbody tr');
    expect(rows).toHaveLength(30);
    expect(rows[0].getAttribute('data-testid')).toBe('statement-2026-09-29');

    byTestId<HTMLButtonElement>('performance-show-all')!.click();
    await render();

    expect(root.querySelectorAll('[data-testid="performance-statements"] tbody tr')).toHaveLength(60);
    expect(byTestId('performance-show-all')).toBeNull();
  });

  it('flags estimated days and says some prices were estimated', async () => {
    await start(
      performanceBody({
        estimated: true,
        points: [navPoint('2026-09-01', 1000, 10_000), navPoint('2026-09-02', 1010, 10_100, { estimated: true })],
      }),
    );

    expect(byTestId('performance-estimated')).not.toBeNull();
    expect(text('statement-2026-09-02')).toContain('Estimated');
    expect(text('statement-2026-09-01')).not.toContain('Estimated');
  });

  it('says the curve starts tomorrow when there are fewer than two closed days', async () => {
    await start(performanceBody({ points: [navPoint('2026-09-01', 1000, 10_000)] }));

    expect(text('performance-short')).toContain('starts tomorrow');
    expect(byTestId('performance-stats')).toBeNull();
    expect(byTestId('performance-benchmark')).toBeNull();
  });

  it('says it is preparing the history while it is built, not that something went wrong', async () => {
    await start({ status: 'building' });

    expect(byTestId('performance-building')?.getAttribute('role')).toBe('status');
    expect(byTestId('performance-error')).toBeNull();
  });

  it('shows the reason and a retry for this section alone when it cannot be read', async () => {
    await answerLinkedAccount(http);
    await answerPortfolio(http, { performance: 'skip' });
    (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL))).flush(
      { errorCode: 'SRV-500', message: 'x' },
      { status: 500, statusText: 'x' },
    );
    await render();

    expect(byTestId('performance-error')?.getAttribute('role')).toBe('alert');

    byTestId('performance-error')!.querySelector<HTMLButtonElement>('button')!.click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL))).flush(performanceBody());
    await render();

    expect(byTestId('performance-error')).toBeNull();
    expect(byTestId('performance-stats')).not.toBeNull();
  });

  describe('benchmark', () => {
    const withBenchmark = (nav: readonly number[]) =>
      performanceBody({
        benchmark: {
          symbol: 'SPY',
          points: nav.map((value, i) => ({ date: `2026-09-0${i + 1}`, nav: value })),
        },
      });

    it('asks only for the history again, with the benchmark, and shows its own spinner meanwhile', async () => {
      await start();

      byTestId<HTMLInputElement>('performance-benchmark')!.click();
      const request = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL));
      fixture.detectChanges();

      expect(request.request.params.get('benchmark')).toBe('SPY');
      expect(byTestId('portfolio-performance')?.getAttribute('aria-busy')).toBe('true');
      expect(byTestId('portfolio-performance')?.querySelector('app-spinner')).not.toBeNull();
      // This section loads again, with its own spinner, and its controls stay where they are.
      expect(byTestId('performance-loading')).not.toBeNull();
      expect(byTestId('performance-benchmark')).not.toBeNull();
      expect(byTestId('performance-range-All')).not.toBeNull();
      http.expectNone((r) => r.url !== PORTFOLIO_PERFORMANCE_URL && r.url.startsWith('/api/v1/portfolio'));

      request.flush(withBenchmark([1000, 1020, 1040]));
      await render();

      expect(byTestId('portfolio-performance')?.getAttribute('aria-busy')).toBe('false');
      expect(byTestId('performance-stats')).not.toBeNull();
      expect(byTestId('performance-benchmark-missing')).toBeNull();
    });

    it('says so when the benchmark history is not there, rather than quietly drawing one line', async () => {
      await start();

      byTestId<HTMLInputElement>('performance-benchmark')!.click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL))).flush(performanceBody());
      await render();

      expect(text('performance-benchmark-missing')).toContain('SPY history is not available yet');
    });

    it('turns the comparison off again', async () => {
      await start();
      byTestId<HTMLInputElement>('performance-benchmark')!.click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL))).flush(withBenchmark([1000, 1020, 1040]));
      await render();

      byTestId<HTMLInputElement>('performance-benchmark')!.click();
      const request = await vi.waitFor(() => http.expectOne((r) => r.url === PORTFOLIO_PERFORMANCE_URL));
      expect(request.request.params.has('benchmark')).toBe(false);
      request.flush(performanceBody());
      await render();

      expect(byTestId('performance-benchmark-missing')).toBeNull();
    });
  });
});
