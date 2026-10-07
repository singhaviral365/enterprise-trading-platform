import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClients } from './api.config';
import { PortfolioApi, isBuilding } from './portfolio-api.service';

const BASE = '/api/v1/portfolio/7';

/** The wrapper is the app's only door to the generated Portfolio client, so these pin it to the contract. */
describe('PortfolioApi', () => {
  let api: PortfolioApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    api = TestBed.inject(PortfolioApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the summary from GET /portfolio/{accountId}', () => {
    api.summary(7).subscribe();

    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('reads the priced positions, restricted to one symbol when asked', () => {
    api.positions(7).subscribe();
    const all = http.expectOne((r) => r.url === `${BASE}/positions`);
    expect(all.request.params.has('symbol')).toBe(false);
    all.flush([]);

    api.positions(7, 'AAPL').subscribe();
    const one = http.expectOne((r) => r.url === `${BASE}/positions`);
    expect(one.request.params.get('symbol')).toBe('AAPL');
    one.flush([]);
  });

  it('reads the profit and loss with the dates and the breakdown flag', () => {
    api.pnl(7, { from: '2026-09-01', to: '2026-10-19', bySymbol: true }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/pnl`);
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('to')).toBe('2026-10-19');
    expect(req.request.params.get('bySymbol')).toBe('true');
    req.flush({});
  });

  it('reads realised profit and loss alone from its own route', () => {
    api.realised(7, { from: '2026-09-01', bySymbol: true }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/realised`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('bySymbol')).toBe('true');
    req.flush({});
  });

  it('reads the performance history with its range and benchmark', () => {
    api.performance(7, { from: '2026-09-01', to: '2026-10-06', benchmark: 'SPY' }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/performance`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('to')).toBe('2026-10-06');
    expect(req.request.params.get('benchmark')).toBe('SPY');
    req.flush({});
  });

  it('leaves out an empty benchmark and tells the history from "building"', () => {
    const answers: unknown[] = [];
    api.performance(7, { benchmark: '' }).subscribe((answer) => answers.push(answer));

    const req = http.expectOne((r) => r.url === `${BASE}/performance`);
    expect(req.request.params.has('benchmark')).toBe(false);
    req.flush({ status: 'building' });

    expect(isBuilding(answers[0] as never)).toBe(true);
    expect(isBuilding({ accountId: 7, baseCurrency: 'USD', estimated: false, points: [] })).toBe(false);
  });

  it('leaves out empty dates', () => {
    api.pnl(7, { from: '', to: '' }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/pnl`);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('to')).toBe(false);
    req.flush({});
  });
});
