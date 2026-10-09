import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClients } from '../../../api/api.config';
import type { MarketRow } from '../../../core/market-row';
import { OrderType } from '../../../core/preferences';
import { PreferencesStore } from '../../../core/preferences.store';
import { OrderTicket } from './order-ticket';

const ROW: MarketRow = {
  quote: { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'EQUITY', price: 200, details: { currency: 'USD' } },
  change: 1,
  changePercent: 0.5,
  previousClose: 199,
  currency: 'USD',
};

describe('OrderTicket starting type', () => {
  async function open(type: OrderType): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [OrderTicket],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: PreferencesStore, useValue: { defaultOrderType: signal(type) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OrderTicket);
    fixture.componentRef.setInput('row', ROW);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const radio = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;

  it('starts on a market order by default', async () => {
    const root = await open(OrderType.Market);

    expect(radio(root, 'order-type-market').checked).toBe(true);
    expect(radio(root, 'order-type-limit').checked).toBe(false);
  });

  it('starts on a limit order for a customer who chose that in Settings', async () => {
    const root = await open(OrderType.Limit);

    expect(radio(root, 'order-type-limit').checked).toBe(true);
    expect(radio(root, 'order-type-market').checked).toBe(false);
  });
});
