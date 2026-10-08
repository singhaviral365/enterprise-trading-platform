import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClients } from '../api/api.config';
import { OrderSide, StrategyStatus, TriggerDirection } from '../api/generated/strategies';
import { AccountOverviewStore } from './account-overview.store';
import { StrategiesStore } from './strategies.store';

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
    maxOrderValue: 10000,
    maxPositionQty: 200,
    maxExecutions: 1,
    maxFailures: 3,
    executions: 0,
    consecutiveFailures: 0,
    status,
    createdAt: '2026-10-07T09:00:00Z',
    updatedAt: '2026-10-07T09:00:00Z',
    ...extra,
  };
}

describe('StrategiesStore', () => {
  let http: HttpTestingController;
  let linked: ReturnType<typeof signal<unknown>>;
  let store: StrategiesStore;

  async function create(account: unknown = { overview: { account: { id: 1001 }, balance: { currency: 'USD' } } }) {
    linked = signal(account);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: AccountOverviewStore, useValue: { linked } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(StrategiesStore);
    TestBed.tick();
  }

  afterEach(() => http.verify());

  it('loads the linked accounts strategies', async () => {
    await create();

    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([strategy(1, 'ACTIVE'), strategy(2, 'DISABLED')]);
    await vi.waitFor(() => expect(store.strategies().length).toBe(2));

    expect(store.accountId()).toBe(1001);
    expect(store.accountCurrency()).toBe('USD');
    expect(store.errorMessage()).toBe('');
  });

  it('does nothing while there is no linked account', async () => {
    await create(null);

    expect(store.accountId()).toBeNull();
    expect(store.strategies()).toEqual([]);
    http.expectNone(LIST_URL);
  });

  it('counts the strategies that can still do something, not the finished ones', async () => {
    await create();
    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([
      strategy(1, 'ACTIVE'),
      strategy(2, 'EXECUTING'),
      strategy(3, 'DISABLED'),
      strategy(4, 'EXECUTED'),
      strategy(5, 'CANCELLED'),
      strategy(6, 'EXPIRED'),
      strategy(7, 'FAILED'),
    ]);
    await vi.waitFor(() => expect(store.strategies().length).toBe(7));

    expect(store.openCount()).toBe(3);
  });

  it('puts a new strategy at the top, built from the request and the linked account', async () => {
    await create();
    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([strategy(1, 'ACTIVE')]);
    await vi.waitFor(() => expect(store.strategies().length).toBe(1));

    const pending = store.create({
      symbol: 'AAPL',
      side: OrderSide.Buy,
      quantity: 50,
      direction: TriggerDirection.Below,
      triggerPrice: 150,
      maxOrderValue: 10000,
      maxPositionQty: 200,
    });
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.accountId).toBe(1001);
    request.flush(strategy(2, 'ACTIVE'));

    expect((await pending).strategyId).toBe(2);
    expect(store.strategies().map((s) => s.strategyId)).toEqual([2, 1]);
  });

  it('refuses to create without a linked account and sends nothing', async () => {
    await create(null);

    await expect(
      store.create({
        symbol: 'AAPL',
        side: OrderSide.Buy,
        quantity: 1,
        direction: TriggerDirection.Below,
        triggerPrice: 1,
        maxOrderValue: 1,
        maxPositionQty: 1,
      }),
    ).rejects.toThrow();
    http.expectNone('/api/v1/strategies');
  });

  it('shows a switch-off at once from the answer, without waiting for the next read', async () => {
    await create();
    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([strategy(1, 'ACTIVE'), strategy(2, 'ACTIVE')]);
    await vi.waitFor(() => expect(store.strategies().length).toBe(2));

    const pending = store.setEnabled(1, false);
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'));
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush(strategy(1, 'DISABLED', { statusReason: 'Switched off by the customer' }));
    await pending;

    expect(store.strategies().map((s) => s.status)).toEqual([StrategyStatus.Disabled, StrategyStatus.Active]);
  });

  it('shows a cancellation from the answer', async () => {
    await create();
    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush([strategy(1, 'DISABLED')]);
    await vi.waitFor(() => expect(store.strategies().length).toBe(1));

    const pending = store.cancel(1);
    const request = await vi.waitFor(() => http.expectOne('/api/v1/strategies/1'));
    expect(request.request.method).toBe('DELETE');
    request.flush(strategy(1, 'CANCELLED'));
    await pending;

    expect(store.strategies()[0].status).toBe(StrategyStatus.Cancelled);
    expect(store.openCount()).toBe(0);
  });

  it('reads a strategys trail', async () => {
    await create();
    http.expectOne(LIST_URL).flush([]);

    const pending = store.runs(1);
    (await vi.waitFor(() => http.expectOne('/api/v1/strategies/1/runs'))).flush([{ runId: 9, runNumber: 1, outcome: 'ORDERED' }]);

    expect((await pending)[0].runId).toBe(9);
  });

  it('turns a failed read into a sentence for the customer', async () => {
    await create();

    (await vi.waitFor(() => http.expectOne(LIST_URL))).flush(
      { errorCode: 'ACC-403', message: 'dev text' },
      { status: 403, statusText: 'Forbidden' },
    );
    await vi.waitFor(() => expect(store.errorMessage()).not.toBe(''));

    expect(store.errorMessage()).not.toContain('dev text');
  });
});
