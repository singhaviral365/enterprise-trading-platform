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

  it('drops an expired session from storage', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ username: 'bob', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1 }),
    );
    expect(TestBed.inject(SessionService).isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
