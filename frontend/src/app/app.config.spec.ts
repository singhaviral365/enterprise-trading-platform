import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { SessionService } from './core/session.service';
import { TEST_TOKENS } from './testing/trade-http';

describe('appConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: appConfig.providers });
  });

  it('builds, and the session it tracks holds no tokens (they are HttpOnly cookies)', () => {
    const session = TestBed.inject(SessionService);
    expect(session.isLoggedIn()).toBe(false);

    session.start('alice', TEST_TOKENS);

    expect(session.isLoggedIn()).toBe(true);
    expect(JSON.stringify(session.session())).not.toContain(TEST_TOKENS.accessToken + '"');
    expect(Object.keys(session.session()!).sort()).toEqual(['expiresAt', 'username']);
  });
});
