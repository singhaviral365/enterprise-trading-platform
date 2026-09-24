import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Credentials service for password hashing and verification using Argon2id.
 *
 * Security notes:
 * - Uses argon2id with cost factor 2 (memory 65536 KiB)
 * - Never logs passwords
 * - Timing-safe comparison to prevent password enumeration
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  /**
   * Hash a plaintext password using Argon2id.
   * Cost factor chosen: timeCost=3, memoryCost=2^16 (65536 KiB)
   * This provides good security without excessive overhead.
   */
  async hashPassword(plaintext: string): Promise<string> {
    try {
      // Argon2id hash with appropriate cost
      const hash = await argon2.hash(plaintext, {
        type: argon2.argon2id,
        timeCost: 3,
        memoryCost: 65536, // 64 MiB
        parallelism: 4,
      });
      return hash;
    } catch (error) {
      this.logger.error('Failed to hash password', error);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify a plaintext password against a stored hash.
   * Returns true if password matches, false otherwise.
   * Uses timing-safe comparison to prevent enumeration.
   */
  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    try {
      const isMatch = await argon2.verify(hash, plaintext);
      return isMatch;
    } catch (error) {
      // Any error in verification (invalid hash format, etc.) = password doesn't match
      this.logger.debug('Password verification error (treated as non-match)');
      return false;
    }
  }
}
