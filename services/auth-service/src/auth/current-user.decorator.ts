import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UnauthorisedException } from '../common/exceptions';
import { AuthenticatedUser } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new UnauthorisedException('Unauthorised');
    }

    return request.user;
  },
);

