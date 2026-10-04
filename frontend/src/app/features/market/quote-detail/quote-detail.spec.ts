import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import type { MarketRow } from '../../../core/market-row';
import { QuoteDetail } from './quote-detail';

const ROW: MarketRow = {
  quote: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: 'EQUITY',
    price: 200,
    details: { currency: 'USD', asOf: '2026-10-01T10:00:00Z' },
  },
  change: 1.5,
  changePercent: 0.75,
  previousClose: 198.5,
  currency: 'USD',
};

describe('QuoteDetail', () => {
  let fixture: ComponentFixture<QuoteDetail>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function show(row: MarketRow): Promise<void> {
    fixture.componentRef.setInput('row', row);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(QuoteDetail);
    root = fixture.nativeElement as HTMLElement;
  });

  it('opens on the price card with a chart placeholder and Buy / Sell', async () => {
    await show(ROW);

    expect(root.querySelector('#detail-title')?.textContent).toContain('AAPL');
    expect(byTestId('quote-price')?.textContent).toContain('$200.00');
    expect(byTestId('quote-chart')).toBeTruthy();
    expect(byTestId('quote-buy')).toBeTruthy();
    expect(byTestId('quote-sell')).toBeTruthy();
    expect(byTestId('order-ticket')).toBeNull();
  });

  it.each([
    ['quote-buy', 'Place buy order'],
    ['quote-sell', 'Place sell order'],
  ])(
    '%s opens the shared buy / sell screen for that side: the price card and the order ticket',
    async (button, submitLabel) => {
      await show(ROW);

      byTestId<HTMLButtonElement>(button)!.click();
      await fixture.whenStable();

      expect(byTestId('order-ticket')).toBeTruthy();
      expect(byTestId('order-submit')?.textContent).toContain(submitLabel);
      // the price card stays on the second screen
      expect(root.querySelector('app-trade-panel app-quote-summary')).toBeTruthy();
      expect(byTestId('quote-price')?.textContent).toContain('$200.00');
      // and the placeholder and the first screen's buttons are gone
      expect(byTestId('quote-chart')).toBeNull();
      expect(byTestId('quote-buy')).toBeNull();
    },
  );

  it('goes back to the first screen from the ticket', async () => {
    await show(ROW);
    byTestId<HTMLButtonElement>('quote-buy')!.click();
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('order-back')!.click();
    await fixture.whenStable();

    expect(byTestId('order-ticket')).toBeNull();
    expect(byTestId('quote-buy')).toBeTruthy();
  });

  it('stays on the ticket when the same instrument gets a fresh price, but starts over for another one', async () => {
    await show(ROW);
    byTestId<HTMLButtonElement>('quote-sell')!.click();
    await fixture.whenStable();

    await show({ ...ROW, quote: { ...ROW.quote, price: 201 } });
    expect(byTestId('order-ticket')).toBeTruthy();
    expect(byTestId('quote-price')?.textContent).toContain('$201.00');

    await show({ ...ROW, quote: { ...ROW.quote, symbol: 'MSFT' } });
    expect(byTestId('order-ticket')).toBeNull();
    expect(byTestId('quote-buy')).toBeTruthy();
  });

  it('asks to be closed from the close button on either screen', async () => {
    await show(ROW);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byTestId<HTMLButtonElement>('quote-close')!.click();
    byTestId<HTMLButtonElement>('quote-buy')!.click();
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('quote-close')!.click();

    expect(closed).toHaveBeenCalledTimes(2);
  });
});
