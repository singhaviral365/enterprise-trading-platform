import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UnauthorisedException } from '../common/exceptions';

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
      secretOrKey: process.env.JWT_SECRET,
      algorithms: ['HS256'],
    });
  }

  /**
   * Validate the JWT payload.
   * This is called after signature verification.
   */
  async validate(payload: any) {
    // Verify required claims
    if (!payload.sub || !payload.accountId || !payload.roles || !payload.iss) {
      throw new UnauthorisedException('Unauthorised');
    }

    // Verify issuer
    if (payload.iss !== process.env.JWT_ISSUER) {
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
