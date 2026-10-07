import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AUTH_API_BASE_URL, provideApiClients } from '../../../api/api.config';
import { NotificationService } from '../../../core/notification.service';
import { SessionService } from '../../../core/session.service';
import { ProfileDialog } from './profile-dialog';

const ME = { id: 1, username: 'alice.trader', email: 'alice@example.com', roles: [], twoFactorEnabled: true, createdOn: '2026-10-05T08:00:00Z' };
const CURRENT = 'Old!Passw0rd#1';
const FRESH = 'N3w!Password#2';

describe('ProfileDialog', () => {
  let fixture: ComponentFixture<ProfileDialog>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function openDialog(): Promise<void> {
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    (await vi.waitFor(() => http.expectOne({ method: 'GET', url: `${AUTH_API_BASE_URL}/auth/me` }))).flush(ME);
    await fixture.whenStable();
  }

  async function fillChange(current = CURRENT, next = FRESH): Promise<void> {
    byTestId<HTMLButtonElement>('profile-change-password')!.click();
    await fixture.whenStable();
    await type('current-password', current);
    await type('profile-new-password', next);
    await type('profile-confirm-password', next);
  }

  beforeEach(async () => {
    localStorage.clear();
    notifications = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ProfileDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', { expiresIn: 900 });
    fixture = TestBed.createComponent(ProfileDialog);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('loads and shows who is signed in, only once it is opened', async () => {
    http.expectNone(`${AUTH_API_BASE_URL}/auth/me`);

    await openDialog();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('profile-username')?.textContent).toContain('alice.trader');
    });
    expect(byTestId('profile-email')?.textContent).toContain('alice@example.com');
    expect(byTestId('profile-two-factor')?.textContent).toContain('On');
    expect(byTestId('change-password-form')).toBeNull();
  });

  it('reveals the form from the Change password button, and Cancel hides it again', async () => {
    await openDialog();
    byTestId<HTMLButtonElement>('profile-change-password')!.click();
    await fixture.whenStable();
    expect(byTestId('change-password-form')).not.toBeNull();

    byTestId<HTMLButtonElement>('change-password-cancel')!.click();
    await fixture.whenStable();

    expect(byTestId('change-password-form')).toBeNull();
  });

  it('keeps the button disabled until the current and new password are valid and match', async () => {
    await openDialog();
    byTestId<HTMLButtonElement>('profile-change-password')!.click();
    await fixture.whenStable();
    const submit = byTestId<HTMLButtonElement>('change-password-submit')!;
    expect(submit.disabled).toBe(true);

    await type('current-password', CURRENT);
    await type('profile-new-password', FRESH);
    await type('profile-confirm-password', 'something else 1!');
    expect(submit.disabled).toBe(true);
    expect(byTestId('profile-confirm-password-error')?.textContent).toContain('do not match');

    await type('profile-confirm-password', FRESH);
    expect(submit.disabled).toBe(false);
  });

  it('sends both passwords together, then closes with a notice', async () => {
    await openDialog();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await fillChange();

    byTestId<HTMLButtonElement>('change-password-submit')!.click();
    const request = await vi.waitFor(() => http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/me/password` }));
    expect(request.request.body).toEqual({ currentPassword: CURRENT, newPassword: FRESH });
    request.flush({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });

    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(notifications.success).toHaveBeenCalled();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(true);
  });

  it('says how many tries are left after a wrong current password, and clears that field', async () => {
    await openDialog();
    await fillChange();

    byTestId<HTMLButtonElement>('change-password-submit')!.click();
    (await vi.waitFor(() => http.expectOne(`${AUTH_API_BASE_URL}/auth/me/password`))).flush(
      { errorCode: 'PWD-403', message: 'x', attemptsLeft: 2 },
      { status: 403, statusText: 'Forbidden' },
    );

    await vi.waitFor(() => expect(byTestId('change-password-error')).not.toBeNull());
    expect(byTestId('change-password-error')?.textContent).toContain('2 tries left');
    expect(byTestId<HTMLInputElement>('current-password')!.value).toBe('');
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(true);
  });

  it('says "1 try left" in the singular', async () => {
    await openDialog();
    await fillChange();

    byTestId<HTMLButtonElement>('change-password-submit')!.click();
    (await vi.waitFor(() => http.expectOne(`${AUTH_API_BASE_URL}/auth/me/password`))).flush(
      { errorCode: 'PWD-403', message: 'x', attemptsLeft: 1 },
      { status: 403, statusText: 'Forbidden' },
    );

    await vi.waitFor(() => expect(byTestId('change-password-error')?.textContent).toContain('1 try left'));
  });

  it('signs the user out when the third wrong password ends the session', async () => {
    await openDialog();
    const signedOut = vi.fn();
    fixture.componentInstance.signedOut.subscribe(signedOut);
    await fillChange();

    byTestId<HTMLButtonElement>('change-password-submit')!.click();
    (await vi.waitFor(() => http.expectOne(`${AUTH_API_BASE_URL}/auth/me/password`))).flush(
      { errorCode: 'PWD-423', message: 'x' },
      { status: 423, statusText: 'Locked' },
    );

    await vi.waitFor(() => expect(signedOut).toHaveBeenCalled());
    http.expectOne({ method: 'POST', url: `${AUTH_API_BASE_URL}/auth/logout` }).flush(null, { status: 204, statusText: 'No Content' });
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
    expect(notifications.error).toHaveBeenCalled();
  });

  it('explains a new password that equals the current one, without counting a try', async () => {
    await openDialog();
    await fillChange(FRESH, FRESH);

    byTestId<HTMLButtonElement>('change-password-submit')!.click();
    (await vi.waitFor(() => http.expectOne(`${AUTH_API_BASE_URL}/auth/me/password`))).flush(
      { errorCode: 'PWD-422', message: 'x' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    await vi.waitFor(() => expect(byTestId('change-password-error')?.textContent).toContain('different'));
    expect(byTestId('change-password-error')?.textContent).not.toContain('tries left');
  });
});
