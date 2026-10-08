import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PriceRanges } from '../price-ranges';
import { PositionRow } from '../position-row';
import { PositionsTable } from './positions-table';

const row = (symbol: string, lastPrice: number | null): PositionRow => ({
  symbol,
  name: `${symbol} Inc.`,
  iconUrl: null,
  quoteCurrency: 'USD',
  quantity: 10,
  averageCost: 100,
  costBasis: 1000,
  pricing:
    lastPrice === null
      ? null
      : {
          status: 'live',
          lastPrice,
          marketValue: lastPrice * 10,
          unrealisedPnl: 0,
          unrealisedPercent: 0,
          dayPnl: 0,
          dayPnlPercent: 0,
          priceAsOf: null,
        },
});

describe('PositionsTable', () => {
  let fixture: ComponentFixture<PositionsTable>;
  let root: HTMLElement;
  let ensure: ReturnType<typeof vi.fn>;

  const ranges: Record<string, { low: number; high: number } | undefined> = { AAPL: { low: 100, high: 200 } };

  beforeEach(async () => {
    ensure = vi.fn();
    await TestBed.configureTestingModule({
      imports: [PositionsTable],
      providers: [{ provide: PriceRanges, useValue: { ensure, accountRange: (symbol: string) => ranges[symbol] ?? null } }],
    }).compileComponents();
    fixture = TestBed.createComponent(PositionsTable);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('currency', 'USD');
  });

  async function show(rows: readonly PositionRow[]): Promise<void> {
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
  }

  it('asks for the 52-week range of the symbols it shows', async () => {
    await show([row('AAPL', 150), row('MSFT', 300)]);

    expect(ensure).toHaveBeenCalledWith(['AAPL', 'MSFT']);
  });

  it('draws where the price sits in its range, in words too', async () => {
    await show([row('AAPL', 150)]);

    const bar = root.querySelector('[data-testid="holding-range-AAPL"] [data-testid="price-range-bar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('52-week range: 50% of the way from the low ($100.00) to the high ($200.00)');
  });

  it('shows a hyphen and the reason when there is no range, or no price to place in it', async () => {
    await show([row('MSFT', 300), row('AAPL', null)]);

    expect(root.querySelector('[data-testid="holding-range-MSFT"] .no-value')?.textContent).toBe('-');
    expect(root.querySelector('[data-testid="holding-range-MSFT"] .visually-hidden')?.textContent).toBe('52-week range not available');
    expect(root.querySelector('[data-testid="holding-range-AAPL"] [data-testid="price-range-bar"]')).toBeNull();
  });

  it('has the range column among the optional ones, which a narrow or compact table drops', async () => {
    await show([row('AAPL', 150)]);

    const header = [...root.querySelectorAll('thead th')].find((th) => th.textContent?.includes('52-week range'));
    expect(header?.classList.contains('col-extra')).toBe(true);
    expect(root.querySelector('[data-testid="holding-range-AAPL"]')?.classList.contains('col-extra')).toBe(true);
  });
});
