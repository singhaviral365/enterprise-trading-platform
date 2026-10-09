import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthDialogService } from './auth-dialog.service';
import { authGuard, guestGuard } from './auth.guards';
import { SessionService } from './session.service';

const TOKENS = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };
const route = {} as ActivatedRouteSnapshot;
const stateFor = (url: string) => ({ url }) as RouterStateSnapshot;

describe('route guards', () => {
  let dialogs: AuthDialogService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    dialogs = TestBed.inject(AuthDialogService);
    router = TestBed.inject(Router);
  });

  const run = (guard: typeof authGuard, url = '/orders') =>
    TestBed.runInInjectionContext(() => guard(route, stateFor(url)));

  describe('authGuard', () => {
    it('lets a signed-in user through', () => {
      TestBed.inject(SessionService).start('alice', TOKENS);

      expect(run(authGuard)).toBe(true);
      expect(dialogs.isOpen()).toBe(false);
    });

    it('sends a guest home, opens the sign-in dialog and remembers the page they wanted', () => {
      const result = run(authGuard, '/orders?page=2') as UrlTree;

      expect(router.serializeUrl(result)).toBe('/');
      expect(dialogs.isOpen()).toBe(true);
      expect(dialogs.mode()).toBe('login');
      expect(dialogs.returnUrl()).toBe('/orders?page=2');
    });
  });

  describe('guestGuard', () => {
    it('shows the home page to a guest', () => {
      expect(run(guestGuard, '/')).toBe(true);
    });

    it('sends a signed-in user to the dashboard', () => {
      TestBed.inject(SessionService).start('alice', TOKENS);

      expect(router.serializeUrl(run(guestGuard, '/') as UrlTree)).toBe('/dashboard');
    });
  });
});
