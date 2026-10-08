import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { RedactingLogger } from '../common/logging/redacting.logger';

/**
 * Credentials Service - Password hashing and verification with Argon2id
 *
 * Cost Parameter Decision: timeCost=3, memoryCost=65536 KiB
 *
 * Rationale:
 * - Argon2id is selected over bcrypt for superior ASIC/GPU resistance and adaptive memory cost
 * - timeCost=3: 3 iterations balance security and performance. Higher values (>4) are not
 *   necessary given the high memoryCost, and would create DoS vulnerability on login endpoint
 * - memoryCost=65536 KiB (64 MiB): High enough to resist GPU attacks (GPU memory is expensive),
 *   but low enough to avoid excessive server resource consumption. This matches OWASP recommendations
 *   for medium-security applications (they recommend 19-40 MiB for low-end hardware)
 * - Target verification time: ~100-150ms per login on standard hardware (acceptable for UX)
 * - Attacker speedup without high-memory ASIC: ~10,000x slower than MD5/SHA-256
 * - DoS impact: At ~150ms per hash, server can safely handle ~6-7 hashes/second without
 *   resource exhaustion under normal load
 *
 * Alternative considered:
 * - bcrypt cost=12: Slower iteration, less memory cost, easier for attackers with GPU/ASIC farms
 *   Rejected: Argon2id is cryptographically superior for our threat model
 */
@Injectable()
export class CredentialsService {
  // Argon2id configuration - defensive against both GPU and ASIC attacks
  private readonly ARGON2_OPTIONS: argon2.HashOptions = {
    type: 2,
    timeCost: 3, // iterations - balance between security and DoS resistance
    memoryCost: 65536, // 64 MiB - high memory requirement for GPU resistance
    parallelism: 2, // adjust based on CPU cores available
  };

  constructor(private readonly redactingLogger: RedactingLogger) {}

  /**
   * Hash a plaintext password using Argon2id.
   *
   * @param plaintext The user's plaintext password (never logged)
   * @returns Promise<string> The Argon2id hash
   * @throws Error if hashing fails
   */
  async hashPassword(plaintext: string): Promise<string> {
    try {
      const hash = await argon2.hash(plaintext, this.ARGON2_OPTIONS);
      this.redactingLogger.debug(
        'CredentialsService',
        'Password hashed successfully',
      );
      return hash;
    } catch (error) {
      this.redactingLogger.error(
        'CredentialsService',
        'Password hashing failed',
        { errorMessage: (error as Error).message },
      );
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify a plaintext password against a stored hash.
   *
   * Uses argon2.verify() which implements timing-safe comparison
   * to prevent password enumeration attacks.
   *
   * @param plaintext The plaintext password to verify (never logged)
   * @param hash The stored Argon2id hash
   * @returns Promise<boolean> True if password matches, false otherwise
   */
  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    try {
      const isMatch = await argon2.verify(hash, plaintext);
      if (!isMatch) {
        this.redactingLogger.debug(
          'CredentialsService',
          'Password verification failed - hash mismatch',
        );
      }
      return isMatch;
    } catch (error) {
      // Any error in verification (invalid hash format, etc.) = password doesn't match
      // Never log the error details to avoid exposing hash format issues
      this.redactingLogger.debug(
        'CredentialsService',
        'Password verification error (treated as non-match)',
      );
      return false;
    }
  }
}
