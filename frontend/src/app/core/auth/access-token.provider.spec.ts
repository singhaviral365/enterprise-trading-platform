import { TestBed } from '@angular/core/testing';
import { ACCESS_TOKEN_PROVIDER } from './access-token.provider';

describe('ACCESS_TOKEN_PROVIDER', () => {
  it('offers no token until the app supplies one', () => {
    const provider = TestBed.inject(ACCESS_TOKEN_PROVIDER);

    expect(provider.getAccessToken()).toBeNull();
    expect(provider.isAuthenticated()).toBe(false);
  });
});
