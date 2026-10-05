import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UnauthorisedException } from '../common/exceptions';
import { ACCESS_TOKEN_COOKIE, readCookie } from './auth-cookies';

const DEFAULT_JWT_ISSUER = 'auth-service';

/**
 * JWT Strategy for Passport.
 * Validates the JWT from the Bearer Authorization header or, for browser sessions, the HttpOnly access_token cookie.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: { headers?: Record<string, string | string[] | undefined> }) =>
          readCookie(request?.headers?.cookie, ACCESS_TOKEN_COOKIE) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-only-change-me-this-secret-is-not-for-production-use',
      algorithms: ['HS256'],
    });
  }

  /**
   * Validate the JWT payload.
   * This is called after signature verification.
   */
  async validate(payload: any) {
    const userId = Number(payload?.sub);

    // Verify required claims and contract-level types.
    if (
      !Number.isInteger(userId) ||
      userId < 1 ||
      !Array.isArray(payload.roles) ||
      payload.roles.length === 0 ||
      !payload.iss
    ) {
      throw new UnauthorisedException('Unauthorised');
    }

    // Verify issuer
    if (payload.iss !== (process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER)) {
      throw new UnauthorisedException('Unauthorised');
    }

    return {
      userId,
      roles: payload.roles,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
