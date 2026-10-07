import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService, UsersRepository } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { RedactingLogger } from '../common/logging/redacting.logger';
import {
  UnauthorisedException,
  RegistrationFailedException,
  ValidationFailedException,
  PasswordReuseException,
} from '../common/exceptions';
import { User } from '../users/user.entity';
import { UserResponseDto, TokenResponseDto } from './dto';
import { LoginThrottleService } from './login-throttle.service';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_JWT_ISSUER = 'auth-service';
const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=65536,t=3,p=2$MDEyMzQ1Njc4OWFiY2RlZg$ae5MbA5HD/nOiVoQN73kuKsSG9C7+nVj5POBuhjB7Nk';

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
    private readonly loginThrottleService: LoginThrottleService,
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
    email?: string,
  ): Promise<UserResponseDto> {
    this.redactingLogger.log(
      'AuthService',
      'Registration attempt',
      { username },
    );

    // Password must not simply repeat the username (compared case-insensitively)
    if (password.trim().toLowerCase() === username.trim().toLowerCase()) {
      this.redactingLogger.warn(
        'AuthService',
        'Registration rejected - password matches username',
        { username },
      );
      throw new ValidationFailedException('Password must be different from the username');
    }

    // Check if username (or the chosen email) is already taken
    const exists =
      (await this.usersRepository.usernameExists(username)) ||
      (email !== undefined && (await this.usersRepository.emailExists(email)));
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
      email,
    );

    this.redactingLogger.log(
      'AuthService',
      'User registered successfully',
      { userId: user.id, username },
    );

    return this.userToResponseDto(user);
  }

  /**
   * Login: Verify credentials and issue access + refresh tokens, in one step. Two-step sign-in does not use this:
   * it calls {@link authenticate} first and {@link issueTokens} only once the emailed code is right.
   */
  async login(
    username: string,
    password: string,
    callerId: string,
  ): Promise<TokenResponseDto> {
    const user = await this.authenticate(username, password, callerId);
    return this.issueTokens(user);
  }

  /**
   * Checks a username and password and returns the user. Issues nothing.
   * Same response for unknown user and wrong password (no enumeration).
   * Uses Argon2id for timing-safe password verification.
   */
  async authenticate(
    username: string,
    password: string,
    callerId: string,
  ): Promise<User> {
    this.redactingLogger.log('AuthService', 'Login attempt', { username });

    const isCallerThrottled = this.loginThrottleService.isBlocked(callerId);

    // Find user by username
    const user = await this.usersRepository.findByUsername(username);

    // Always verify against a real Argon2id hash so unknown-user and wrong-password paths do comparable work.
    const hashForVerification = user?.password_hash ?? DUMMY_ARGON2ID_HASH;
    const isPasswordValid = await this.credentialsService.verifyPassword(
      password,
      hashForVerification,
    );

    // Return same error for unknown user or wrong password
    if (!user || !isPasswordValid || isCallerThrottled) {
      this.loginThrottleService.recordFailure(callerId);
      this.redactingLogger.warn(
        'AuthService',
        'Login failed - invalid credentials',
        { username },
      );
      throw new UnauthorisedException('Unauthorised');
    }

    this.loginThrottleService.reset(callerId);

    this.redactingLogger.log('AuthService', 'Login successful', {
      userId: user.id,
      username,
    });

    return user;
  }

  /** Issues the access and refresh tokens for a user whose identity has been established. */
  async issueTokens(user: User): Promise<TokenResponseDto> {
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
   * Sets a new password for a user who proved they own their email (password reset). The new password must differ
   * from the current one and from the username, and every session the user had is ended, so whoever knew the old
   * password is signed out too. The format rules are the DTO's, as on registration.
   */
  async setNewPassword(
    userId: number,
    newPassword: string,
    beforeApply?: () => Promise<void>,
  ): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorisedException('Unauthorised');
    }
    if (newPassword.trim().toLowerCase() === user.username.trim().toLowerCase()) {
      throw new ValidationFailedException('Password must be different from the username');
    }
    if (await this.credentialsService.verifyPassword(newPassword, user.password_hash)) {
      throw new PasswordReuseException();
    }

    // Every check has passed. The caller's hook is where a single-use token is spent: only now, and only once.
    await beforeApply?.();

    const passwordHash = await this.credentialsService.hashPassword(newPassword);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);
    await this.refreshTokensService.revokeAllForUser(userId);
    this.redactingLogger.log('AuthService', 'Password changed', { userId });
    return user;
  }

  /**
   * Logout: revoke the presented refresh token so it cannot be exchanged again. The access token is a
   * stateless JWT and simply expires (15 minutes); the controller clears both cookies.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokensService.revokeRefreshToken(refreshToken);
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
      email: user.email,
      roles: user.roles,
      createdOn: user.created_on,
      twoFactorEnabled: user.two_factor_enabled === true,
    };
  }

  /** The user as the API describes them. */
  toUserResponse(user: User): UserResponseDto {
    return this.userToResponseDto(user);
  }
}
