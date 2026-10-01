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
    session.start('alice.trader', { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Header);
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne('/api/v1/accounts/link'))).flush({ linked: false, message: 'No linked account yet' });
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')!.click();
    await fixture.whenStable();

    expect(session.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(root.querySelector('[data-testid="open-auth-dialog"]')).toBeTruthy();
  });
});
