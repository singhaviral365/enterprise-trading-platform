import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { guestGuard } from './auth.guards';
import { PreferencesStore } from './preferences.store';
import { SessionService } from './session.service';

describe('guestGuard and the landing page', () => {
  const landingRoute = signal('/dashboard');

  beforeEach(() => {
    localStorage.clear();
    landingRoute.set('/dashboard');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PreferencesStore, useValue: { landingRoute } }],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() => guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('sends a signed-in user to the page they chose to open on', () => {
    TestBed.inject(SessionService).start('alice', { expiresIn: 900 });
    landingRoute.set('/portfolio/holdings');

    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/portfolio/holdings');
  });

  it('sends a signed-in user who chose nothing to the dashboard', () => {
    TestBed.inject(SessionService).start('alice', { expiresIn: 900 });

    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/dashboard');
  });

  it('lets a guest see the home page', () => {
    expect(run()).toBe(true);
  });
});
