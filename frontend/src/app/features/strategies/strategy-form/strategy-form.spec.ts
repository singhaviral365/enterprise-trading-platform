import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideApiClients } from '../../../api/api.config';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { NotificationService } from '../../../core/notification.service';
import { StrategyForm } from './strategy-form';

const QUOTES = {
  quotes: [
    { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'EQUITY', price: 200, currency: 'USD', details: null },
    { symbol: 'NOPRICE', name: 'No Price Ltd', assetClass: 'EQUITY', price: null, currency: 'USD', details: null },
  ],
  asOf: '2026-10-07T10:00:00Z',
  stale: false,
};

describe('StrategyForm', () => {
  let fixture: ComponentFixture<StrategyForm>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let notifications: { success: ReturnType<typeof vi.fn> };

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function choose(selector: string, value: string): Promise<void> {
    const select = root.querySelector<HTMLSelectElement>(selector)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  /** A valid strategy from the five inputs alone: buy 50 AAPL if it falls to 150. No limit is typed. */
  async function fillValid(): Promise<void> {
    await choose('#strategy-symbol', 'AAPL');
    await type('strategy-trigger', '150');
    await type('strategy-quantity', '50');
  }

  beforeEach(async () => {
    notifications = { success: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StrategyForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        {
          provide: AccountOverviewStore,
          useValue: { linked: signal({ overview: { account: { id: 1001 }, balance: { currency: 'USD' } } }) },
        },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StrategyForm);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (await vi.waitFor(() => http.expectOne('/api/v1/market/quotes'))).flush(QUOTES);
    // The form shares the strategies store, which reads the account's list when it is first used.
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/1001/strategies'))).flush([]);
    await settle();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('offers the instruments that have a price, and shows the price of the one chosen', async () => {
    const labels = [...root.querySelectorAll('#strategy-symbol option')].map((o) => o.textContent?.trim());
    expect(labels).toContain('AAPL, Apple Inc.');
    expect(labels.some((label) => label?.includes('NOPRICE'))).toBe(false);

    await choose('#strategy-symbol', 'AAPL');

    expect(text('strategy-now')).toContain('$200.00');
  });

  it('keeps Create disabled until the five inputs make a rule, and enables it with no limit typed', async () => {
    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(true);

    await fillValid();

    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(false);
    expect(byTestId<HTMLInputElement>('strategy-max-order')!.value).toBe('');
    expect(byTestId<HTMLInputElement>('strategy-max-position')!.value).toBe('');
  });

  it('has five inputs in the main row, and the rest behind a closed More options', async () => {
    const row = root.querySelector('.rule-row')!;
    expect(row.querySelectorAll('select, input').length).toBeGreaterThanOrEqual(5);
    const more = byTestId<HTMLDetailsElement>('strategy-more')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('#strategy-max-executions')).not.toBeNull();
    expect(more.querySelector('#strategy-valid-until')).not.toBeNull();
    expect(more.querySelector('#strategy-max-order')).not.toBeNull();
    expect(more.querySelector('#strategy-max-position')).not.toBeNull();
    expect(root.querySelector('.strategy-form > fieldset')).toBeNull();
    expect(root.textContent).not.toContain('1. The rule');
  });

  it('says in one live sentence what the rule does, how often, and the worst case', async () => {
    await fillValid();

    const summary = text('strategy-summary-text');
    expect(summary).toContain('Buy 50 AAPL when the price falls to $150.00.');
    expect(summary).toContain('Runs once.');
    // 50 x 150 = 7,500 plus 15% = 8,625 in the account currency.
    expect(summary).toContain('Worst case about $8,625');
    expect(summary).toContain('can differ');
    expect(byTestId('strategy-summary')!.getAttribute('aria-live')).toBe('polite');
  });

  it('follows the rule as it changes: sell, above, more runs', async () => {
    await choose('#strategy-direction', 'ABOVE');
    await fillValid();
    await type('strategy-trigger', '260');
    root.querySelector<HTMLInputElement>('[data-testid="order-side-sell"]')!.click();
    await type('strategy-max-executions', '3');

    const summary = text('strategy-summary-text');
    expect(summary).toContain('Sell 50 AAPL when the price rises to $260.00.');
    expect(summary).toContain('Runs up to 3 times');
    expect(summary).toContain('capped at about');
    expect(summary).toContain('per order');
  });

  it('asks what to do before there is a rule instead of showing a sentence', async () => {
    expect(byTestId('strategy-summary-text')).toBeNull();
    expect(text('strategy-summary')).toContain('Choose an instrument and a price');
  });

  it('says what is wrong with each field once it has been visited, and only then', async () => {
    expect(root.querySelector('.form-error-text')).toBeNull();

    await type('strategy-trigger', '-5');
    await type('strategy-quantity', '0');

    const form = root.textContent ?? '';
    expect(form).toContain('Enter a price above 0 with up to 4 decimal places.');
    expect(form).toContain('Quantity must be a whole number of at least 1.');
    expect(byTestId('strategy-trigger')!.getAttribute('aria-invalid')).toBe('true');
    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(true);
  });

  it('has no permanent helper paragraphs under the inputs', async () => {
    await fillValid();

    expect(root.textContent).not.toContain("In the instrument's own currency");
    expect(root.textContent).not.toContain('These are checked before every order');
    expect(root.textContent).not.toContain('Use the quantity');
    expect(root.querySelector('[data-testid="strategy-use-suggested"]')).toBeNull();
  });

  it('checks the limits only when they are typed in More options, and keeps the ceilings in front of the customer', async () => {
    await fillValid();
    await type('strategy-max-order', '12.345');
    await type('strategy-max-position', '0');

    expect(root.textContent).toContain('Enter an amount above 0 with up to 2 decimal places.');
    expect(root.textContent).toContain('Enter a whole number of at least 1.');
    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(true);

    await type('strategy-max-order', '10000001');
    await type('strategy-quantity', '1000001');
    expect(root.textContent).toContain('The most one order may cost is 10,000,000.');
    expect(root.textContent).toContain('Quantity can be at most 1,000,000.');
  });

  it('wants a buys position limit, when typed, to be at least the quantity', async () => {
    await type('strategy-quantity', '50');
    await type('strategy-max-position', '10');

    expect(root.textContent).toContain('This must be at least the quantity you are buying.');
  });

  it('refuses an end date more than a year ahead, or in the past', async () => {
    await type('strategy-valid-until', '2099-01-31');
    expect(root.textContent).toContain('The end date can be at most 366 days ahead.');

    await type('strategy-valid-until', '2001-01-01');
    expect(root.textContent).toContain('The end date must be in the future.');
  });

  it('refuses a trigger the price has already reached, in one short line, before the server has to', async () => {
    await fillValid();
    await type('strategy-trigger', '250');

    expect(byTestId('strategy-already-reached')).toBeTruthy();
    expect(text('strategy-already-reached')).toBe('AAPL is already below that level, so this would trade now. Pick a lower price.');
    expect(byTestId('strategy-summary-text')).toBeNull();
    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(true);

    await type('strategy-trigger', '150');
    expect(byTestId('strategy-already-reached')).toBeNull();
    expect(byTestId<HTMLButtonElement>('strategy-submit')!.disabled).toBe(false);
  });

  it('reads an above trigger from the other side', async () => {
    await choose('#strategy-direction', 'ABOVE');
    await fillValid();
    await type('strategy-trigger', '150');

    expect(text('strategy-already-reached')).toContain('already above that level');
    expect(text('strategy-already-reached')).toContain('Pick a higher price');

    await type('strategy-trigger', '260');
    expect(byTestId('strategy-already-reached')).toBeNull();
  });

  it('shows what auto means for the spending cap as a placeholder, and a typed cap replaces it in the sentence', async () => {
    await fillValid();

    expect(byTestId<HTMLInputElement>('strategy-max-order')!.placeholder).toBe('auto: 8,625');

    await type('strategy-max-order', '9000');
    expect(text('strategy-summary-text')).toContain('Worst case about $9,000');
  });

  it('creates the strategy from the five inputs, sending no limit, plus an end of day, then says so and hands it on', async () => {
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    await fillValid();
    const end = new Date(Date.now() + 30 * 86_400_000);
    const day = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    await type('strategy-valid-until', day);

    byTestId<HTMLFormElement>('strategy-form')!.dispatchEvent(new Event('submit'));
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies'));

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      accountId: 1001,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 50,
      direction: 'BELOW',
      triggerPrice: 150,
      maxExecutions: 1,
    });
    expect(request.request.body.maxOrderValue).toBeUndefined();
    expect(request.request.body.maxPositionQty).toBeUndefined();
    expect(request.request.body.maxFailures).toBeUndefined();
    const sent = new Date(request.request.body.validUntil);
    expect([sent.getFullYear(), sent.getMonth(), sent.getDate()]).toEqual([end.getFullYear(), end.getMonth(), end.getDate()]);
    expect([sent.getHours(), sent.getMinutes()]).toEqual([23, 59]);
    request.flush({ strategyId: 5001, symbol: 'AAPL' });
    await settle();

    expect(created).toHaveBeenCalledTimes(1);
    expect(notifications.success).toHaveBeenCalledWith('Strategy #5001 is watching AAPL.');
  });

  it('sends no end date when none was chosen', async () => {
    await fillValid();

    byTestId<HTMLFormElement>('strategy-form')!.dispatchEvent(new Event('submit'));
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies'));

    expect(request.request.body.validUntil).toBeUndefined();
    request.flush({ strategyId: 1, symbol: 'AAPL' });
    await settle();
  });

  it('sends the limits that were typed in More options, and only those', async () => {
    await fillValid();
    await type('strategy-max-order', '10000');
    await type('strategy-max-position', '200');

    byTestId<HTMLFormElement>('strategy-form')!.dispatchEvent(new Event('submit'));
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies'));

    expect(request.request.body).toMatchObject({ maxOrderValue: 10000, maxPositionQty: 200 });
    request.flush({ strategyId: 1, symbol: 'AAPL' });
    await settle();
  });

  it('sells when the side is switched', async () => {
    await fillValid();
    root.querySelector<HTMLInputElement>('[data-testid="order-side-sell"]')!.click();
    await settle();

    byTestId<HTMLFormElement>('strategy-form')!.dispatchEvent(new Event('submit'));
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies'));

    expect(request.request.body.side).toBe('SELL');
    request.flush({ strategyId: 1, symbol: 'AAPL' });
    await settle();
  });

  it('shows the servers refusal as a sentence and does not report a strategy as created', async () => {
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    await fillValid();

    byTestId<HTMLFormElement>('strategy-form')!.dispatchEvent(new Event('submit'));
    (await vi.waitFor(() => http.expectOne('/api/v1/strategies'))).flush(
      { errorCode: 'STR-422', message: 'dev text' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle();

    expect(text('strategy-error')).toContain('most open strategies');
    expect(text('strategy-error')).not.toContain('dev text');
    expect(created).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('can be cancelled without sending anything', async () => {
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    byTestId<HTMLButtonElement>('strategy-cancel')!.click();

    expect(cancelled).toHaveBeenCalledTimes(1);
    http.expectNone('/api/v1/strategies');
  });
});
