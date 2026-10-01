import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClients } from '../../api/api.config';
import { SessionService } from '../../core/session.service';
import { Positions } from './positions';

const BASE = '/api/v1/accounts/1001';

describe('Positions', () => {
  let fixture: ComponentFixture<Positions>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const symbols = () =>
    Array.from(root.querySelectorAll('[data-testid="position-row"]')).map((row) => row.querySelector('th')?.textContent?.trim());
  /** Lets the resource settle, then paints it. */
  const render = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function start(positions: unknown[]): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({
      linked: true,
      message: 'Linked account found',
      accountNumber: 'ACC000001001',
    });
    (await vi.waitFor(() => http.expectOne(BASE))).flush({
      id: 1001,
      accountId: 'ACC000001001',
      holderName: 'USER-1000',
      cashBalance: 25000,
      status: 'ACTIVE',
      version: 1,
      lastUpdated: '2026-10-01T00:00:00Z',
    });
    http.expectOne(`${BASE}/balance`).flush({ accountId: 1001, cashBalance: 25000, currency: 'USD', asOf: '' });
    http.expectOne(`${BASE}/positions`).flush(positions);
    http.expectOne(`${BASE}/orders`).flush([]);
    await render();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Positions],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    fixture = TestBed.createComponent(Positions);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  const HELD = [
    { accountId: 1001, symbol: 'MSFT', quantity: 10, averageCost: 400 },
    { accountId: 1001, symbol: 'AAPL', quantity: 50, averageCost: 175 },
  ];

  it('lists positions by symbol with cost basis and a total', async () => {
    await start(HELD);

    expect(symbols()).toEqual(['AAPL', 'MSFT']);
    expect(byTestId('positions-total')?.textContent).toContain('12,750.00');
  });

  it('filters by symbol and resets the filter', async () => {
    await start(HELD);

    const box = root.querySelector<HTMLInputElement>('[data-testid="filter-symbol"] input[data-value="MSFT"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await render();
    expect(symbols()).toEqual(['MSFT']);
    expect(byTestId('positions-total')?.textContent).toContain('4,000.00');

    byTestId<HTMLButtonElement>('filters-reset')!.click();
    await render();
    expect(symbols()).toEqual(['AAPL', 'MSFT']);
  });

  it('handles an account with no positions', async () => {
    await start([]);

    expect(byTestId('positions-empty')?.textContent).toContain("don't hold any positions");
    expect(root.querySelector('table')).toBeNull();
  });
});
