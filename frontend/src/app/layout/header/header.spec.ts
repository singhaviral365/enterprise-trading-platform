import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { SESSION_STORAGE_KEY, SessionService } from '../../core/session.service';
import { provideApiClients } from '../../api/api.config';
import { Header } from './header';

describe('Header', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients(), provideRouter([])],
    }).compileComponents();
  });

  it('opens the sign-in dialog from the Login / Register button', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="open-auth-dialog"]')!
      .click();

    const dialogs = TestBed.inject(AuthDialogService);
    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('login');
  });

  it('signing out clears the session and returns home', async () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', { expiresIn: 900 });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Header);
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({ linked: false, message: 'No linked account yet' });
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')!.click();
    // The Auth service is told so it can revoke the refresh token and clear the cookies.
    http.expectOne({ method: 'POST', url: 'http://localhost:3000/auth/logout' }).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(session.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(root.querySelector('[data-testid="open-auth-dialog"]')).toBeTruthy();
  });

  it('shows the profile button beside the theme toggle only when signed in, and opens the profile dialog', async () => {
    const signedOut = TestBed.createComponent(Header);
    await signedOut.whenStable();
    expect((signedOut.nativeElement as HTMLElement).querySelector('[data-testid="open-profile"]')).toBeNull();

    TestBed.inject(SessionService).start('alice.trader', { expiresIn: 900 });
    const fixture = TestBed.createComponent(Header);
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({ linked: false, message: 'No linked account yet' });
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('[data-testid="open-profile"]')!.click();
    (await vi.waitFor(() => http.expectOne({ method: 'GET', url: 'http://localhost:3000/auth/me' }))).flush({
      id: 1,
      username: 'alice.trader',
      email: 'alice@example.com',
      roles: [],
      twoFactorEnabled: false,
    });
    await fixture.whenStable();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('[data-testid="profile-username"]')?.textContent).toContain('alice.trader');
    });
    expect(root.querySelector('[data-testid="profile-email"]')?.textContent).toContain('alice@example.com');
  });
});
