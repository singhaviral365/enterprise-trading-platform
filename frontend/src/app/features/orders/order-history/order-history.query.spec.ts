import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideApiClients } from '../../../api/api.config';
import { SessionService } from '../../../core/session.service';
import { TEST_TOKENS, answerLinkedAccount, orderEntry } from '../../../testing/trade-http';
import { OrderHistory } from './order-history';

/** The dashboard's Open orders card links to /orders?status=NEW, which must open already filtered. */
describe('OrderHistory status from the address', () => {
  async function open(query: Record<string, string>) {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    TestBed.inject(SessionService).start('alice', TEST_TOKENS);
    const fixture = TestBed.createComponent(OrderHistory);
    const http = TestBed.inject(HttpTestingController);
    await answerLinkedAccount(http, {
      orders: [
        orderEntry('1', 'AAPL', 'NEW', '2026-10-01T10:00:00Z'),
        orderEntry('2', 'MSFT', 'FILLED', '2026-10-02T10:00:00Z'),
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="order-row"] .label-symbol',
      ),
    ).map((symbol) => symbol.textContent?.trim());
    return rows;
  }

  it('shows only working orders for ?status=NEW', async () => {
    expect(await open({ status: 'NEW' })).toEqual(['AAPL']);
  });

  it('shows everything without a status, and ignores a status it does not know', async () => {
    expect(await open({})).toHaveLength(2);
    TestBed.resetTestingModule();
    expect(await open({ status: 'BOGUS' })).toHaveLength(2);
  });
});
