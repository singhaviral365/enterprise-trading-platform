import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../api/api.config';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { SessionService } from '../../core/session.service';
import {
  LINK_URL,
  QUOTES_URL,
  SAMPLE_QUOTES,
  TEST_TOKENS,
  answerLinkedAccount,
  answerUnlinkedAccount,
  orderEntry,
} from '../../testing/trade-http';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  /** The market board loads its own quotes alongside the account. */
  async function answerMarket(): Promise<void> {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush({
      quotes: SAMPLE_QUOTES,
      asOf: '2026-10-01T10:00:00Z',
      stale: false,
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(Dashboard);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('greets the signed-in user and shows a spinner while the account loads', async () => {
    await vi.waitFor(() => fixture.detectChanges());

    expect(byTestId('dashboard-username')?.textContent).toContain('alice.trader');
    expect(root.textContent).toContain('Loading your account');
    await answerUnlinkedAccount(http);
    await answerMarket();
  });

  it('invites a user with no account to open one', async () => {
    await answerUnlinkedAccount(http);
    await answerMarket();
    await fixture.whenStable();

    expect(byTestId('dashboard-no-account')).toBeTruthy();
    expect(byTestId('dashboard-cash-balance')).toBeNull();

    byTestId<HTMLButtonElement>('dashboard-open-account')!.click();
    const dialogs = TestBed.inject(AuthDialogService);
    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('account');
  });

  it('summarises the account: cash, invested at cost, positions and open orders', async () => {
    await answerLinkedAccount(http, {
      cashBalance: 24800,
      positions: [
        { accountId: 1001, symbol: 'AAPL', quantity: 10, averageCost: 100 },
        { accountId: 1001, symbol: 'MSFT', quantity: 5, averageCost: 200 },
      ],
      orders: [
        orderEntry('1', 'AAPL', 'FILLED', '2026-09-30T10:00:00Z'),
        orderEntry('2', 'MSFT', 'REJECTED', '2026-09-29T10:00:00Z'),
        orderEntry('3', 'TSLA', 'NEW', '2026-10-01T09:00:00Z'),
      ],
    });
    await answerMarket();
    await fixture.whenStable();

    expect(byTestId('dashboard-cash-balance')?.textContent).toContain('$24,800.00');
    expect(root.textContent).toContain('ACC000001001');
    expect(root.textContent).toContain('$2,000.00');
    const stats = Array.from(root.querySelectorAll('.stat')).map((s) => s.textContent?.replace(/\s+/g, ' ').trim());
    expect(stats.some((s) => s?.includes('Positions') && s.includes('2'))).toBe(true);
    expect(stats.some((s) => s?.includes('Open orders') && s.includes('1'))).toBe(true);
    expect(byTestId('dashboard-status-notice')).toBeNull();
  });

  it('lists recent orders newest first, capped at five, with a link to the full history', async () => {
    const orders = Array.from({ length: 7 }, (_, i) =>
      orderEntry(`o${i}`, `SYM${i}`, 'FILLED', `2026-09-0${i + 1}T10:00:00Z`, i % 2 ? 'SELL' : 'BUY'),
    );
    await answerLinkedAccount(http, { orders });
    await answerMarket();
    await fixture.whenStable();

    const symbols = Array.from(root.querySelectorAll('.simple-table tbody th')).map((t) => t.textContent?.trim());
    expect(symbols).toEqual(['SYM6', 'SYM5', 'SYM4', 'SYM3', 'SYM2']);
    expect(byTestId('orders-view-more')?.getAttribute('href')).toBe('/orders');
  });

  it('says so when there are no orders yet', async () => {
    await answerLinkedAccount(http);
    await answerMarket();
    await fixture.whenStable();

    expect(root.textContent).toContain("You haven't placed any orders yet.");
    expect(byTestId('orders-view-more')).toBeNull();
  });

  it('warns that a suspended account cannot trade', async () => {
    await answerLinkedAccount(http, { status: 'SUSPENDED' });
    await answerMarket();
    await fixture.whenStable();

    expect(byTestId('dashboard-status-notice')?.textContent).toContain('suspended');
  });

  it('reports a failed account load with a retry', async () => {
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush(null, { status: 500, statusText: 'x' });
    await answerMarket();
    await fixture.whenStable();

    expect(byTestId('dashboard-error')).toBeTruthy();

    byTestId<HTMLButtonElement>('dashboard-error')!.querySelector('button')!.click();
    await answerLinkedAccount(http);
    await fixture.whenStable();
    expect(byTestId('dashboard-error')).toBeNull();
    expect(byTestId('dashboard-cash-balance')).toBeTruthy();
  });
});
