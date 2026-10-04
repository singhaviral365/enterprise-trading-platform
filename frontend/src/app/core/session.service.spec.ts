import { TestBed } from '@angular/core/testing';
import { SESSION_STORAGE_KEY, SessionService } from './session.service';

const GRANT = { accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 };

describe('SessionService', () => {
  beforeEach(() => localStorage.clear());

  it('remembers who signed in and when the access cookie runs out, and nothing secret', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', GRANT, 1_000);

    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(stored).toEqual({ username: 'alice.trader', expiresAt: 901_000 });
    // The tokens live in HttpOnly cookies; they must never reach localStorage.
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('access');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('refresh');
  });

  it('needs only the lifetime from a sign-in response', () => {
    const session = TestBed.inject(SessionService);

    session.start('alice.trader', { expiresIn: 60 }, 0);

    expect(session.session()).toEqual({ username: 'alice.trader', expiresAt: 60_000 });
  });

  it('clears the in-memory and stored session on sign-out', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', GRANT);

    session.clear();

    expect(session.isLoggedIn()).toBe(false);
    expect(session.session()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('restores an unexpired session from storage', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'bob', expiresAt: Date.now() + 60_000 }));
    expect(TestBed.inject(SessionService).username()).toBe('bob');
  });

  it('keeps a session whose access cookie has expired, so the refresh cookie can renew it', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'bob', expiresAt: Date.now() - 1 }));

    const session = TestBed.inject(SessionService);

    expect(session.isLoggedIn()).toBe(true);
    expect(session.session()!.expiresAt).toBeLessThan(Date.now());
  });

  it('drops a stored session that is malformed', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'bob' }));
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    localStorage.setItem(SESSION_STORAGE_KEY, 'not json');
    TestBed.resetTestingModule();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('discards a session saved by an older version and erases the tokens it left in localStorage', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'bob', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 }),
    );

    const session = TestBed.inject(SessionService);

    expect(session.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('renews the session for the same user', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', GRANT, 1_000);

    session.renew({ expiresIn: 60 }, 5_000);

    expect(session.username()).toBe('alice.trader');
    expect(session.session()).toEqual({ username: 'alice.trader', expiresAt: 65_000 });
  });

  it('ignores a renewal when nobody is signed in', () => {
    const session = TestBed.inject(SessionService);

    session.renew(GRANT);

    expect(session.isLoggedIn()).toBe(false);
  });

  it('follows another tab: a renewal it made, and its sign-out', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', GRANT);

    const renewedAt = Date.now() + 600_000;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'alice.trader', expiresAt: renewedAt }));
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(session.session()?.expiresAt).toBe(renewedAt);

    localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(session.isLoggedIn()).toBe(false);
  });

  it('ignores storage changes to other keys', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', GRANT);
    localStorage.removeItem(SESSION_STORAGE_KEY);

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));

    expect(session.isLoggedIn()).toBe(true);
  });
});
