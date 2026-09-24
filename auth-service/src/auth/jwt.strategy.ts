import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UnauthorisedException } from '../common/exceptions';

const DEFAULT_JWT_ISSUER = 'auth-service';

/**
 * JWT Strategy for Passport.
 * Validates JWT tokens in Bearer Authorization header.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
    // Verify required claims and contract-level types.
    if (
      !payload?.sub ||
      !Number.isInteger(payload.accountId) ||
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
      userId: payload.sub,
      accountId: payload.accountId,
      roles: payload.roles,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
