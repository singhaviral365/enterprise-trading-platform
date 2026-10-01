import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { ACCESS_TOKEN_PROVIDER } from './core/auth/access-token.provider';
import { SessionService } from './core/session.service';
import { TEST_TOKENS } from './testing/trade-http';

describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
  });

  it('feeds the generated clients the signed-in session token', () => {
    const provider = TestBed.inject(ACCESS_TOKEN_PROVIDER);
    expect(provider.isAuthenticated()).toBe(false);
    expect(provider.getAccessToken()).toBeNull();

    TestBed.inject(SessionService).start('alice', TEST_TOKENS);

    expect(provider.isAuthenticated()).toBe(true);
    expect(provider.getAccessToken()).toBe('a');
  });
});
