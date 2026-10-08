import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../../api/api.config';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { DialogService } from '../../core/dialog.service';
import { NotificationService } from '../../core/notification.service';
import { StrategiesPage } from './strategies';

const LIST_URL = '/api/v1/accounts/1001/strategies';

function strategy(strategyId: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    strategyId,
    accountId: 1001,
    symbol: 'AAPL',
    instrumentName: 'Apple Inc.',
    currency: 'USD',
    side: 'BUY',
    quantity: 50,
    direction: 'BELOW',
    triggerPrice: 150,
    armed: true,
    validFrom: null,
    validUntil: null,
    maxOrderValue: 10000,
    maxPositionQty: 200,
    maxExecutions: 1,
    maxFailures: 3,
    executions: 0,
    consecutiveFailures: 0,
    status,
    statusReason: null,
    lastOrderId: null,
    createdAt: '2026-10-07T09:00:00Z',
    updatedAt: '2026-10-07T09:00:00Z',
    executedAt: null,
    ...extra,
  };
}

describe('StrategiesPage', () => {
  let fixture: ComponentFixture<StrategiesPage>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let confirm: ReturnType<typeof vi.fn>;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function create(options: { linked?: boolean; answer?: unknown[] } = {}): Promise<void> {
    confirm = vi.fn(async () => true);
    notifications = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StrategiesPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        {
          provide: AccountOverviewStore,
          useValue: {
            linked: signal(
              options.linked === false ? null : { overview: { account: { id: 1001 }, balance: { currency: 'USD' } } },
            ),
          },
        },
        { provide: DialogService, useValue: { confirm } },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StrategiesPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    if (options.linked !== false) {
      (await vi.waitFor(() => http.expectOne(LIST_URL))).flush(options.answer ?? []);
    }
    await render();
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('asks for a trading account first and reads nothing without one', async () => {
    await create({ linked: false });

    expect(byTestId('strategies-no-account')).toBeTruthy();
    expect(byTestId('strategies-new')).toBeNull();
    http.expectNone(LIST_URL);
  });

  it('says plainly when there are no strategies yet and offers to make the first', async () => {
    await create({ answer: [] });

    expect(byTestId('strategies-empty')).toBeTruthy();
    expect(root.textContent).toContain('Create your first strategy');
  });

  it('explains how the customer is protected before anything else', async () => {
    await create({ answer: [] });

    const safety = byTestId('strategies-safety')?.textContent ?? '';
    expect(safety).toContain('How your money is protected');
    expect(safety).toContain('Switching a strategy off or cancelling it stops any order that has not been placed yet');
    expect(safety).toContain('through');
  });

  it('lists each strategy as a rule with its status in words and its runs, with the limits left to the activity view', async () => {
    await create({
      answer: [
        strategy(1, 'ACTIVE'),
        strategy(2, 'DISABLED', { side: 'SELL', direction: 'ABOVE', triggerPrice: 200, quantity: 10, statusReason: 'Switched off by the customer' }),
        strategy(3, 'EXECUTED', { executions: 1 }),
        strategy(4, 'FAILED', { statusReason: 'Stopped after 3 failed attempts in a row. Last problem: x' }),
        strategy(5, 'ACTIVE', { armed: false, validUntil: '2026-12-31T23:59:59Z' }),
      ],
    });

    expect(text('strategy-row-1')).toContain('Buy 50 when the price is at or below $150.00');
    expect(text('strategy-status-1')).toBe('Watching');
    expect(text('strategy-row-1')).toContain('0 of 1');
    expect(text('strategy-row-1')).not.toContain('Order up to');
    expect(text('strategy-row-1')).not.toContain('Holding up to');
    expect(text('strategy-row-1')).toContain('No end');

    expect(text('strategy-row-2')).toContain('Sell 10 when the price is at or above $200.00');
    expect(text('strategy-status-2')).toBe('Switched off');
    expect(text('strategy-row-2')).toContain('Switched off by the customer');

    expect(text('strategy-status-3')).toBe('Done');
    expect(text('strategy-status-4')).toBe('Stopped');
    expect(text('strategy-row-4')).toContain('Stopped after 3 failed attempts');

    expect(text('strategy-row-5')).toContain('Waiting to see a price on the other side first');
    expect(text('strategy-row-5')).not.toContain('No end');
  });

  it('summarises how many are watching and how many are still open', async () => {
    await create({ answer: [strategy(1, 'ACTIVE'), strategy(2, 'DISABLED'), strategy(3, 'EXECUTED'), strategy(4, 'ACTIVE')] });

    expect(text('strategies-summary')).toContain('2 watching, 3 open of 4');
  });

  it('offers only the actions that make sense for each status', async () => {
    await create({
      answer: [
        strategy(1, 'ACTIVE'),
        strategy(2, 'EXECUTING'),
        strategy(3, 'DISABLED'),
        strategy(4, 'EXECUTED'),
        strategy(5, 'CANCELLED'),
        strategy(6, 'EXPIRED'),
        strategy(7, 'FAILED'),
      ],
    });

    const has = (kind: string, id: number) => byTestId(`strategy-${kind}-${id}`) !== null;
    expect([has('off', 1), has('on', 1), has('cancel', 1)]).toEqual([true, false, true]);
    expect([has('off', 2), has('on', 2), has('cancel', 2)]).toEqual([true, false, true]);
    expect([has('off', 3), has('on', 3), has('cancel', 3)]).toEqual([false, true, true]);
    for (const id of [4, 5, 6, 7]) {
      expect([has('off', id), has('on', id), has('cancel', id)], `strategy ${id}`).toEqual([false, false, false]);
      expect(has('activity', id), `strategy ${id}`).toBe(true);
    }
  });

  it('switches a strategy off straight away and shows it from the answer', async () => {
    await create({ answer: [strategy(1, 'ACTIVE')] });

    byTestId<HTMLButtonElement>('strategy-off-1')!.click();
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'));
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush(strategy(1, 'DISABLED', { statusReason: 'Switched off by the customer' }));
    await render();

    expect(text('strategy-status-1')).toBe('Switched off');
    expect(byTestId('strategy-on-1')).toBeTruthy();
    expect(byTestId('strategy-off-1')).toBeNull();
    expect(notifications.success).toHaveBeenCalledWith('Strategy #1 is switched off. It will not place any order.');
  });

  it('switches a strategy back on', async () => {
    await create({ answer: [strategy(1, 'DISABLED')] });

    byTestId<HTMLButtonElement>('strategy-on-1')!.click();
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'));
    expect(request.request.body).toEqual({ enabled: true });
    request.flush(strategy(1, 'ACTIVE', { armed: false }));
    await render();

    expect(text('strategy-status-1')).toBe('Watching');
    expect(text('strategy-row-1')).toContain('Waiting to see a price on the other side first');
    expect(notifications.success).toHaveBeenCalledWith(expect.stringContaining('waits for the price to move through your level'));
  });

  it('holds the strategys buttons while its change is on the way, so it cannot be sent twice', async () => {
    await create({ answer: [strategy(1, 'ACTIVE')] });

    byTestId<HTMLButtonElement>('strategy-off-1')!.click();
    await render();

    expect(byTestId<HTMLButtonElement>('strategy-off-1')!.disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>('strategy-cancel-1')!.disabled).toBe(true);
    (await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'))).flush(strategy(1, 'DISABLED'));
    await render();
  });

  it('says what happened when the change is refused, and looks at the list again', async () => {
    await create({ answer: [strategy(1, 'ACTIVE')] });

    byTestId<HTMLButtonElement>('strategy-off-1')!.click();
    (await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'))).flush(
      { errorCode: 'STR-409', message: 'dev text' },
      { status: 409, statusText: 'Conflict' },
    );

    // Whatever was refused, the list may be out of date, so it is read again; the page settles only once that is answered.
    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([strategy(1, 'EXECUTED')]);
    await render();

    expect(notifications.error).toHaveBeenCalledTimes(1);
    expect(notifications.error.mock.calls[0][0]).not.toContain('dev text');
    expect(text('strategy-status-1')).toBe('Done');
  });

  it('asks before cancelling and cancels only when told to', async () => {
    await create({ answer: [strategy(1, 'ACTIVE')] });

    confirm.mockResolvedValueOnce(false);
    byTestId<HTMLButtonElement>('strategy-cancel-1')!.click();
    await render();
    http.expectNone('/api/v1/strategies/1');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', title: 'Cancel this strategy?' }));

    byTestId<HTMLButtonElement>('strategy-cancel-1')!.click();
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'));
    expect(request.request.method).toBe('DELETE');
    request.flush(strategy(1, 'CANCELLED'));
    await render();

    expect(text('strategy-status-1')).toBe('Cancelled');
    expect(byTestId('strategy-cancel-1')).toBeNull();
  });

  it('opens a strategys activity and shows what it did', async () => {
    await create({ answer: [strategy(1, 'EXECUTED', { executions: 1 })] });

    byTestId<HTMLButtonElement>('strategy-activity-1')!.click();
    (await vi.waitFor(() => http.expectOne('/api/v1/strategies/1/runs'))).flush([
      {
        runId: 7,
        runNumber: 1,
        outcome: 'ORDERED',
        quotePrice: 149.8,
        quoteAt: '2026-10-07T10:00:00Z',
        orderId: 77,
        detail: 'Order placed',
        settledStatus: 'FILLED',
        createdAt: '2026-10-07T10:00:01Z',
      },
    ]);
    await render();

    const activity = text('strategy-activity');
    expect(text('strategy-limits')).toContain('Spends at most 10,000 per order, holds at most 200 units, stops after 3 failures');
    expect(activity).toContain('Order placed');
    expect(activity).toContain('149.8');
    expect(activity).toContain('#77');
    expect(activity).toContain('Filled');
    expect(byTestId('strategy-activity-1')!.getAttribute('aria-expanded')).toBe('true');

    byTestId<HTMLButtonElement>('strategy-activity-1')!.click();
    await render();
    expect(byTestId('strategy-activity')).toBeNull();
  });

  it('opens the form from the New strategy button and closes it once a strategy is created', async () => {
    await create({ answer: [strategy(1, 'ACTIVE')] });
    expect(byTestId('strategy-form')).toBeNull();

    byTestId<HTMLButtonElement>('strategies-new')!.click();
    fixture.detectChanges();
    (await vi.waitFor(() => http.expectOne('/api/v1/market/quotes'))).flush({ quotes: [], asOf: '', stale: false });
    await render();
    expect(byTestId('strategy-form')).toBeTruthy();
    expect(byTestId('strategies-new')).toBeNull();

    byTestId<HTMLButtonElement>('strategy-cancel')!.click();
    await render();
    expect(byTestId('strategy-form')).toBeNull();
    expect(byTestId('strategies-new')).toBeTruthy();
  });

  it('shows a read failure with a way to try again', async () => {
    confirm = vi.fn();
    notifications = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StrategiesPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        { provide: AccountOverviewStore, useValue: { linked: signal({ overview: { account: { id: 1001 }, balance: { currency: 'USD' } } }) } },
        { provide: DialogService, useValue: { confirm } },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StrategiesPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush(
      { errorCode: 'SRV-500', message: 'boom' },
      { status: 500, statusText: 'Server Error' },
    );
    await render();

    expect(byTestId('strategies-error')).toBeTruthy();
    expect(byTestId('strategies-error')!.textContent).not.toContain('boom');
  });
});
