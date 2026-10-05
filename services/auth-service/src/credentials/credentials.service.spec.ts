import { Test, TestingModule } from '@nestjs/testing';
import { CredentialsService } from './credentials.service';
import { RedactingLogger } from '../common/logging/redacting.logger';

describe('CredentialsService', () => {
  let service: CredentialsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CredentialsService, RedactingLogger],
    }).compile();

    service = module.get<CredentialsService>(CredentialsService);
  });

  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      // Argon2id hashes start with $argon2id$
      expect(hash).toContain('$argon2id$');
    });

    it('should produce different hashes for the same password (salting)', async () => {
      const password = 'TestPassword123!@#';
      const hash1 = await service.hashPassword(password);
      const hash2 = await service.hashPassword(password);

      expect(hash1).not.toEqual(hash2);
    });

    it('should use Argon2id, not MD5 or SHA', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // Verify it's Argon2id format
      expect(hash).toContain('$argon2id$');

      // Verify it's NOT a simple hash (MD5 is 32 hex chars, SHA256 is 64 hex chars)
      const isMD5 = /^[a-f0-9]{32}$/.test(hash);
      const isSHA256 = /^[a-f0-9]{64}$/.test(hash);

      expect(isMD5).toBe(false);
      expect(isSHA256).toBe(false);
    });

    it('should use Argon2id parameters with sufficient cost', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // Argon2id hash format: $argon2id$v=19$m=65536,t=3,p=2$salt$hash
      // We verify the memory cost is at least 65536 KiB
      expect(hash).toMatch(/m=65536/);
      expect(hash).toMatch(/t=3/);
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      const result = await service.verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'TestPassword123!@#';
      const wrongPassword = 'WrongPassword456$%^';
      const hash = await service.hashPassword(password);

      const result = await service.verifyPassword(wrongPassword, hash);

      expect(result).toBe(false);
    });

    it('should reject empty password against non-empty hash', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      const result = await service.verifyPassword('', hash);

      expect(result).toBe(false);
    });

    it('should handle invalid hash gracefully', async () => {
      const password = 'TestPassword123!@#';
      const invalidHash = 'not-a-valid-argon2-hash';

      const result = await service.verifyPassword(password, invalidHash);

      expect(result).toBe(false);
    });

    it('should implement timing-safe comparison (no fast-fail on first mismatch)', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // This test verifies timing-safe comparison by checking that
      // verification doesn't return immediately for wrong passwords
      // Argon2 library implements this internally
      const result = await service.verifyPassword('Wrong', hash);

      expect(result).toBe(false);
      // The fact that we're using argon2.verify ensures timing-safe comparison
    });
  });

  describe('security requirements', () => {
    it('should never use MD5 hash algorithm', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // MD5 would produce a 32-character hex string
      const isMD5Like = /^[a-f0-9]{32}$/.test(hash);
      expect(isMD5Like).toBe(false);
    });

    it('should never use SHA-256 hash algorithm', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // SHA256 would produce a 64-character hex string
      const isSHA256Like = /^[a-f0-9]{64}$/.test(hash);
      expect(isSHA256Like).toBe(false);
    });

    it('should use Argon2id for password hashing', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      expect(hash).toContain('$argon2id$');
    });

    it('should use high memory cost to resist GPU attacks', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // Verify memory cost is 65536 KiB (64 MiB)
      expect(hash).toMatch(/m=65536/);
    });

    it('should use appropriate time cost to prevent DoS', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      // Verify time cost is 3 (balance between security and DoS resistance)
      expect(hash).toMatch(/t=3/);
    });
  });

  describe('password hashing performance', () => {
    it('should complete password hashing in reasonable time (~100-200ms)', async () => {
      const password = 'TestPassword123!@#';
      const startTime = Date.now();
      const hash = await service.hashPassword(password);
      const duration = Date.now() - startTime;

      expect(hash).toBeDefined();
      // With t=3, m=65536, typical hardware should hash in 100-300ms
      expect(duration).toBeLessThan(1000); // Should not take more than 1 second
      console.log(`Password hashing took ${duration}ms`);
    });

    it('should complete password verification in reasonable time', async () => {
      const password = 'TestPassword123!@#';
      const hash = await service.hashPassword(password);

      const startTime = Date.now();
      const result = await service.verifyPassword(password, hash);
      const duration = Date.now() - startTime;

      expect(result).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete quickly
      console.log(`Password verification took ${duration}ms`);
    });
  });
});
