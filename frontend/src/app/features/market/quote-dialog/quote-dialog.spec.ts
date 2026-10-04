import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import type { MarketRow } from '../../../core/market-row';
import { QuoteDialog } from './quote-dialog';

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

describe('QuoteDialog', () => {
  let fixture: ComponentFixture<QuoteDialog>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function show(row: MarketRow | null): Promise<void> {
    fixture.componentRef.setInput('row', row);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(QuoteDialog);
    root = fixture.nativeElement as HTMLElement;
  });

  it('is closed with no instrument selected', async () => {
    await show(null);

    expect(byTestId<HTMLDialogElement>('quote-dialog')!.open).toBe(false);
    expect(root.querySelector('.quote-panel')).toBeNull();
  });

  it('opens with the symbol, name, price, move and previous close', async () => {
    await show(ROW);

    expect(byTestId<HTMLDialogElement>('quote-dialog')!.open).toBe(true);
    expect(root.querySelector('#quote-dialog-title')?.textContent).toContain('AAPL');
    expect(root.querySelector('.quote-subtitle')?.textContent).toContain('Apple Inc.');
    expect(root.querySelector('.asset-chip')?.textContent).toContain('EQUITY');
    expect(byTestId('quote-dialog-price')?.textContent).toContain('$200.00');
    expect(root.querySelector('.quote-move')?.textContent).toContain('+1.50');
    expect(root.querySelector('.quote-move')?.textContent).toContain('+0.75%');
    expect(byTestId('quote-dialog-previous-close')?.textContent).toContain('$198.50');
    expect(byTestId('quote-dialog-date')?.getAttribute('datetime')).toBe('2026-10-01T10:00:00Z');
    expect(root.querySelector('.quote-panel')?.classList.contains('is-up')).toBe(true);
  });

  it('copes with a missing quote, date and previous close', async () => {
    await show({
      quote: { symbol: 'NVDA', name: null, assetClass: null, price: null, details: { asOf: 'not a date' } },
      change: null,
      changePercent: null,
      previousClose: null,
      currency: null,
    });

    expect(byTestId('quote-dialog-price')?.textContent).toContain('No live quote');
    expect(byTestId('quote-dialog-date')).toBeNull();
    expect(byTestId('quote-dialog-previous-close')).toBeNull();
    expect(root.querySelector('.quote-move')).toBeNull();
    expect(root.querySelector('.quote-subtitle')?.textContent).toContain('Instrument');
  });

  it('shows a falling instrument as down and a plain number without a currency', async () => {
    await show({ ...ROW, change: -2, changePercent: -1, currency: null, previousClose: 202 });

    expect(root.querySelector('.quote-panel')?.classList.contains('is-down')).toBe(true);
    expect(byTestId('quote-dialog-price')?.textContent).toContain('200.00');
    expect(byTestId('quote-dialog-previous-close')?.textContent).toContain('202.00');
  });

  it.each([
    ['quote-buy', 'Place buy order'],
    ['quote-sell', 'Place sell order'],
  ])('%s opens the order ticket for that side', async (button, submitLabel) => {
    await show(ROW);

    byTestId<HTMLButtonElement>(button)!.click();
    await fixture.whenStable();

    expect(byTestId('order-ticket')).toBeTruthy();
    expect(byTestId('order-submit')?.textContent).toContain(submitLabel);
  });

  it('goes back to the quote from the ticket, and starts on the quote for the next instrument', async () => {
    await show(ROW);
    byTestId<HTMLButtonElement>('quote-buy')!.click();
    await fixture.whenStable();

    byTestId<HTMLButtonElement>('order-back')!.click();
    await fixture.whenStable();
    expect(byTestId('order-ticket')).toBeNull();

    byTestId<HTMLButtonElement>('quote-sell')!.click();
    await fixture.whenStable();
    await show({ ...ROW, quote: { ...ROW.quote, symbol: 'MSFT' } });
    expect(byTestId('order-ticket')).toBeNull();
    expect(byTestId('quote-buy')).toBeTruthy();
  });

  it('asks to be closed from the close button, Esc and a backdrop click, but not from inside the panel', async () => {
    await show(ROW);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const dialog = byTestId<HTMLDialogElement>('quote-dialog')!;

    byTestId<HTMLButtonElement>('quote-dialog-close')!.click();
    expect(closed).toHaveBeenCalledTimes(1);

    const esc = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(2);

    dialog.click();
    expect(closed).toHaveBeenCalledTimes(3);

    root.querySelector<HTMLElement>('.quote-panel')!.click();
    expect(closed).toHaveBeenCalledTimes(3);
  });

  it('closes the native dialog when the instrument is cleared', async () => {
    await show(ROW);
    await show(null);

    expect(byTestId<HTMLDialogElement>('quote-dialog')!.open).toBe(false);
  });
});
