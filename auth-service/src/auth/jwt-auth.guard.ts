import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import * as jsonwebtoken from 'jsonwebtoken';
import { UnauthorisedException } from '../common/exceptions';

const DEFAULT_JWT_ISSUER = 'auth-service';

type AccessTokenClaims = {
  sub: string;
  accountId: number;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
};

export type AuthenticatedUser = {
  userId: string;
  accountId: number;
  roles: string[];
  iat: number;
  exp: number;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();

    const token = this.extractBearerToken(request.headers?.authorization);
    const payload = this.verifyAccessToken(token);
    request.user = this.buildAuthenticatedUser(payload);

    return true;
  }

  protected buildAuthenticatedUser(payload: AccessTokenClaims): AuthenticatedUser {
    return {
      userId: payload.sub,
      accountId: payload.accountId,
      roles: payload.roles,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  private extractBearerToken(authorizationHeader: string | string[] | undefined): string {
    if (typeof authorizationHeader !== 'string') {
      throw new UnauthorisedException('Unauthorised');
    }

    const parts = authorizationHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorisedException('Unauthorised');
    }

    return parts[1];
  }

  private verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const payload = jsonwebtoken.verify(token, process.env.JWT_SECRET || '', {
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER,
      });

      this.assertContractClaims(payload);
      return payload;
    } catch {
      throw new UnauthorisedException('Unauthorised');
    }
  }

  private assertContractClaims(payload: unknown): asserts payload is AccessTokenClaims {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorisedException('Unauthorised');
    }

    const claims = payload as {
      sub?: unknown;
      accountId?: unknown;
      roles?: unknown;
      iat?: unknown;
      exp?: unknown;
      iss?: unknown;
    };
    const roles = claims.roles;
    if (
      typeof claims.sub !== 'string' ||
      !Number.isInteger(claims.accountId) ||
      !Array.isArray(roles) ||
      roles.length === 0 ||
      !roles.every((role) => typeof role === 'string') ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      typeof claims.iss !== 'string'
    ) {
      throw new UnauthorisedException('Unauthorised');
    }
  }
}


