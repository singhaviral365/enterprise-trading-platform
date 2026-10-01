import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository, LessThan, IsNull } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class RefreshTokensRepository {
  private readonly refreshTokenRepository: Repository<RefreshToken>;

  constructor(private dataSource: DataSource) {
    this.refreshTokenRepository =
      this.dataSource.getRepository(RefreshToken);
  }

  /**
   * Create and save a new refresh token.
   */
  async create(token: Partial<RefreshToken>): Promise<RefreshToken> {
    const newToken = this.refreshTokenRepository.create(token);
    return this.refreshTokenRepository.save(newToken);
  }

  /**
   * Find a refresh token by its hash (not the token itself).
   */
  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokenRepository.findOne({
      where: { token_hash: tokenHash, revoked_at: IsNull() },
      relations: ['user'],
    });
  }

  /**
   * Revoke a refresh token by hash.
   */
  async revokeByHash(tokenHash: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { token_hash: tokenHash },
      { revoked_at: new Date() },
    );
  }

  /**
   * Revoke all refresh tokens for a user (for theft detection).
   */
  async revokeAllForUser(userId: number): Promise<void> {
    await this.refreshTokenRepository.update(
      { user_id: userId },
      { revoked_at: new Date() },
    );
  }

  /**
   * Clean up expired tokens (optional maintenance).
   */
  async deleteExpired(): Promise<void> {
    await this.refreshTokenRepository.delete({
      expires_at: LessThan(new Date()),
    });
  }
}

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  /**
   * Generate a random refresh token and return both the token and its hash.
   * Token is returned to client, hash is stored in database.
   */
  generateToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
  }

  /**
   * Create a new refresh token for a user.
   */
  async createRefreshToken(
    userId: number,
    expiresIn: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const { token, hash } = this.generateToken();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.refreshTokensRepository.create({
      user_id: userId,
      token_hash: hash,
      expires_at: expiresAt,
      revoked_at: null,
    });

    return { token, expiresAt };
  }

  /**
   * Verify and consume a refresh token.
   * Returns the user ID if valid, null if invalid/revoked/expired.
   * On valid consumption, revokes the old token.
   */
  async verifyAndConsumeRefreshToken(token: string): Promise<number | null> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const refreshToken = await this.refreshTokensRepository.findByHash(hash);

    // Token not found, revoked, or expired
    if (!refreshToken) {
      return null;
    }

    // Check expiration
    if (new Date() > refreshToken.expires_at) {
      return null;
    }

    // Token is valid - revoke it (one-time use)
    await this.refreshTokensRepository.revokeByHash(hash);
    return refreshToken.user_id;
  }

  /**
   * Detect token theft: if a consumed token is presented again, revoke entire chain.
   */
  async detectTheftAndRevoke(userId: number): Promise<void> {
    // Revoke all active refresh tokens for this user
    await this.refreshTokensRepository.revokeAllForUser(userId);
    this.logger.warn(`Token theft detected for user ${userId}, revoked all tokens`);
  }
}
