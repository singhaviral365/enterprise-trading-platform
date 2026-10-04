import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { SessionService } from '../session.service';
import { authGuard } from './auth.guard';
import { safeReturnUrl } from './return-url';

function setup(authenticated: boolean) {
  localStorage.clear();
  if (authenticated) {
    TestBed.inject(SessionService).start('alice', { expiresIn: 900 });
  }
}

function run(url: string) {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as never, { url } as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  it('blocks unauthenticated navigation and redirects to sign-in with the return address', () => {
    setup(false);
    const result = run('/orders?tab=open');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/sign-in?returnUrl=%2Forders%3Ftab%3Dopen',
    );
  });

  it('allows authenticated navigation', () => {
    setup(true);
    expect(run('/orders')).toBe(true);
  });
});

describe('safeReturnUrl', () => {
  const origin = 'http://localhost:4200';

  it('accepts a path on this origin', () => {
    expect(safeReturnUrl('/orders?tab=open#x', origin)).toBe('/orders?tab=open#x');
  });

  it('refuses an off-origin return address', () => {
    for (const bad of [
      'https://evil.example/phish',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'orders',
      null,
    ]) {
      expect(safeReturnUrl(bad, origin)).toBeNull();
    }
  });
});
