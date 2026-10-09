import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import { UnauthorisedException } from '../common/exceptions';

/** Pulls the factory behind `@CurrentUser()` out of Nest's metadata, the way Nest itself calls it. */
function factory(): (data: unknown, ctx: ExecutionContext) => unknown {
  class Probe {
    handler(@CurrentUser() _user: unknown): void {
      // only here to register the parameter decorator
    }
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown }
  >;
  return Object.values(metadata)[0].factory;
}

const contextWith = (request: object) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('CurrentUser', () => {
  it('returns the user the guard attached to the request', () => {
    const user = { userId: 1000, roles: ['CUSTOMER'], iat: 1, exp: 2 };

    expect(factory()(undefined, contextWith({ user }))).toBe(user);
  });

  it('refuses a request nobody authenticated', () => {
    expect(() => factory()(undefined, contextWith({}))).toThrow(UnauthorisedException);
  });
});
