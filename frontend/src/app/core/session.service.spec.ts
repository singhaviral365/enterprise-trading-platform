import { TestBed } from '@angular/core/testing';
import { SESSION_STORAGE_KEY, SessionService } from './session.service';

const TOKENS = { accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 };

describe('SessionService', () => {
  beforeEach(() => localStorage.clear());

  it('stores the tokens when a session starts', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', TOKENS);

    expect(session.isLoggedIn()).toBe(true);
    expect(session.username()).toBe('alice.trader');
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({
      username: 'alice.trader',
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('clears the in-memory and stored session on sign-out', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', TOKENS);

    session.clear();

    expect(session.isLoggedIn()).toBe(false);
    expect(session.accessToken()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('restores an unexpired session from storage', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'bob', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 }),
    );
    expect(TestBed.inject(SessionService).username()).toBe('bob');
  });

  it('keeps a session whose access token has expired, so the refresh token can renew it', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'bob', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1 }),
    );

    const session = TestBed.inject(SessionService);

    expect(session.isLoggedIn()).toBe(true);
    expect(session.session()!.expiresAt).toBeLessThan(Date.now());
  });

  it('drops a stored session that is malformed', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: 'bob', accessToken: 'a' }));
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    localStorage.setItem(SESSION_STORAGE_KEY, 'not json');
    TestBed.resetTestingModule();
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
  });

  it('renews the tokens for the same user', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', TOKENS, 1_000);

    session.renew({ ...TOKENS, accessToken: 'newer', refreshToken: 'newer-r', expiresIn: 60 }, 5_000);

    expect(session.username()).toBe('alice.trader');
    expect(session.session()).toMatchObject({ accessToken: 'newer', refreshToken: 'newer-r', expiresAt: 65_000 });
  });

  it('ignores a renewal when nobody is signed in', () => {
    const session = TestBed.inject(SessionService);

    session.renew(TOKENS);

    expect(session.isLoggedIn()).toBe(false);
  });

  it('follows another tab: tokens it renewed, and its sign-out', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', TOKENS);

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'alice.trader', accessToken: 'tab-b', refreshToken: 'r2', expiresAt: Date.now() + 60_000 }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(session.accessToken()).toBe('tab-b');

    localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(session.isLoggedIn()).toBe(false);
  });

  it('ignores storage changes to other keys', () => {
    const session = TestBed.inject(SessionService);
    session.start('alice.trader', TOKENS);
    localStorage.removeItem(SESSION_STORAGE_KEY);

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));

    expect(session.isLoggedIn()).toBe(true);
  });
});
