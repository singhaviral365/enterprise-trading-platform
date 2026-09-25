import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService, UsersRepository } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { RedactingLogger } from '../common/logging/redacting.logger';
import {
  UnauthorisedException,
  RegistrationFailedException,
} from '../common/exceptions';
import { UserResponseDto, TokenResponseDto } from './dto';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_JWT_ISSUER = 'auth-service';

/**
 * Auth service implements the 4 operations:
 * 1. Register: Create user (no tokens issued)
 * 2. Login: Verify credentials, issue tokens
 * 3. Refresh: Consume refresh token, issue new token pair
 * 4. GetUser: Return authenticated user profile
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly credentialsService: CredentialsService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly jwtService: JwtService,
    private readonly redactingLogger: RedactingLogger,
  ) {}

  private buildAccessToken(user: {
    id: number;
    roles: string[];
  }): string {
    const iat = Math.floor(Date.now() / 1000);
    const roles = Array.isArray(user.roles) ? user.roles.filter(Boolean) : [];

    if (roles.length === 0) {
      throw new UnauthorisedException('Unauthorised');
    }

    const tokenPayload: any = {
      sub: user.id,
      roles,
      iat,
    };

    return this.jwtService.sign(
      tokenPayload,
      {
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  /**
   * Register: Create a new user.
   * - Does NOT issue tokens
    * - Does NOT create trading account
   * - Uses Argon2id password hashing (never plaintext, never MD5/SHA)
   */
  async register(
    username: string,
    password: string,
  ): Promise<UserResponseDto> {
    this.redactingLogger.log(
      'AuthService',
      'Registration attempt',
      { username },
    );

    // Check if username already taken
    const exists = await this.usersRepository.usernameExists(username);
    if (exists) {
      this.redactingLogger.warn(
        'AuthService',
        'Registration failed - username already taken',
        { username },
      );
      throw new RegistrationFailedException('Registration failed');
    }

    // Hash password using Argon2id
    const passwordHash = await this.credentialsService.hashPassword(password);
    this.redactingLogger.debug('AuthService', 'Password hashed successfully');

    // Create user with default CUSTOMER role
    const user = await this.usersService.createUser(
      username,
      passwordHash,
      ['CUSTOMER'],
    );

    this.redactingLogger.log(
      'AuthService',
      'User registered successfully',
      { userId: user.id, username },
    );

    return this.userToResponseDto(user);
  }

  /**
   * Login: Verify credentials and issue access + refresh tokens.
   * Same response for unknown user and wrong password (no enumeration).
   * Uses Argon2id for timing-safe password verification.
   */
  async login(
    username: string,
    password: string,
  ): Promise<TokenResponseDto> {
    this.redactingLogger.log('AuthService', 'Login attempt', { username });

    // Find user by username
    const user = await this.usersRepository.findByUsername(username);

    // Check password (even if user not found, do a dummy verify to prevent timing attacks)
    const isPasswordValid = user
      ? await this.credentialsService.verifyPassword(password, user.password_hash)
      : await this.credentialsService.verifyPassword(
          password,
          '$argon2id$v=19$m=65536,t=3,p=4$' + 'x'.repeat(22) + '$' + 'x'.repeat(43),
        );

    // Return same error for unknown user or wrong password
    if (!user || !isPasswordValid) {
      this.redactingLogger.warn(
        'AuthService',
        'Login failed - invalid credentials',
        { username },
      );
      throw new UnauthorisedException('Unauthorised');
    }

    this.redactingLogger.log('AuthService', 'Login successful', {
      userId: user.id,
      username,
    });

    // Generate refresh token
    const refreshTokenData = await this.refreshTokensService.createRefreshToken(
      user.id,
      parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '604800', 10),
    );

    // Sign access token
    const accessToken = this.buildAccessToken(user);

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * Refresh: Exchange refresh token for new access + refresh token pair.
   * Old refresh token is revoked (one-time use).
   * If a consumed token is presented again, revoke entire chain (theft detection).
   */
  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    // Verify and consume the refresh token
    const userId = await this.refreshTokensService.verifyAndConsumeRefreshToken(
      refreshToken,
    );

    // Invalid/revoked/expired token
    if (!userId) {
      // Could be theft (token already consumed) - handle in detector
      throw new UnauthorisedException('Unauthorised');
    }

    // Get user
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }

    // Issue new refresh token
    const newRefreshTokenData =
      await this.refreshTokensService.createRefreshToken(
        user.id,
        parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '604800', 10),
      );

    // Sign new access token
    const accessToken = this.buildAccessToken(user);

    return {
      accessToken,
      refreshToken: newRefreshTokenData.token,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * GetUser: Return the authenticated user profile.
   * Called after JWT validation by the JwtGuard.
   */
  async getUser(userId: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }
    return this.userToResponseDto(user);
  }

  /**
   * Convert User entity to UserResponseDto.
   */
  private userToResponseDto(user: any): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      roles: user.roles,
      createdOn: user.created_on,
    };
  }
}
