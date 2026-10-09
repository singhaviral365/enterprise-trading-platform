import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../api/api.config';
import { QUOTES_URL, SAMPLE_QUOTES } from '../../testing/trade-http';
import { Market } from './market';

describe('Market', () => {
  let fixture: ComponentFixture<Market>;
  let http: HttpTestingController;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Market],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(Market);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('is the home of the live market board, under its own page title', async () => {
    (await vi.waitFor(() => http.expectOne(QUOTES_URL))).flush({
      quotes: SAMPLE_QUOTES,
      asOf: '2026-10-04T05:00:00Z',
      stale: false,
    });
    await fixture.whenStable();

    expect(root.querySelector('h1')?.textContent).toContain('Market data');
    expect(root.querySelector('app-market-board [data-testid="market-table"]')).toBeTruthy();
  });
});
