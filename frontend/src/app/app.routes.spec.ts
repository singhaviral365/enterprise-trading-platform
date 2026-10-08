import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideApiClients } from './api/api.config';
import { routes } from './app.routes';
import { AuthDialogService } from './core/auth-dialog.service';
import { SessionService } from './core/session.service';
import { TEST_TOKENS } from './testing/trade-http';

describe('app routes', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    });
    router = TestBed.inject(Router);
  });

  it('shows the public home page to a guest', async () => {
    await RouterTestingHarness.create('/');

    expect(router.url).toBe('/');
    expect(document.title).toBe('Trading Platform');
  });

  it('sends the old positions address to the portfolio page', async () => {
    await RouterTestingHarness.create('/positions');

    expect(TestBed.inject(AuthDialogService).returnUrl()).toBe('/portfolio/holdings');
  });

  it.each(['/dashboard', '/market', '/orders', '/portfolio', '/settings', '/showcase'])(
    'keeps a guest out of %s and opens sign-in',
    async (path) => {
      await RouterTestingHarness.create(path);

      expect(router.url).toBe('/');
      const dialogs = TestBed.inject(AuthDialogService);
      expect(dialogs.isOpen()).toBe(true);
      expect(dialogs.returnUrl()).toBe(path);
    },
  );

  it('sends a signed-in user from the home page to the dashboard', async () => {
    TestBed.inject(SessionService).start('alice', TEST_TOKENS);

    await RouterTestingHarness.create('/');

    expect(router.url).toBe('/dashboard');
  });

  it('sends unknown addresses home', async () => {
    await RouterTestingHarness.create('/no/such/page');

    expect(router.url).toBe('/');
  });
});
