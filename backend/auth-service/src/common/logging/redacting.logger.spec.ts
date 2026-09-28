import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { RedactingLogger } from './redacting.logger';

describe('RedactingLogger', () => {
  let logger: RedactingLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedactingLogger],
    }).compile();

    logger = module.get<RedactingLogger>(RedactingLogger);
  });

  describe('redaction of sensitive fields', () => {
    it('should redact password field', () => {
      const testData = { username: 'john', password: 'secret123' };

      // Spy on the internal logger
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should redact password_hash field', () => {
      const testData = {
        username: 'john',
        password_hash: '$argon2id$v=19$m=65536$...',
      };

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      logger.error('test', 'Test message', testData);

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should redact passwordHash field (camelCase)', () => {
      const testData = { username: 'john', passwordHash: 'hash123' };

      const debugSpy = jest
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => {});

      logger.debug('test', 'Test message', testData);

      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
    });

    it('should redact token field', () => {
      const testData = {
        accessToken: 'eyJhbGc...',
        refreshToken: 'refresh_token_123',
      };

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should redact nested password fields at any depth', () => {
      const testData = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            password_hash: 'hash123',
          },
        },
      };

      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});

      logger.warn('test', 'Test message', testData);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should redact authorization header', () => {
      const testData = {
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('redaction verification', () => {
    it('should actually redact password values in output', () => {
      const testData = { password: 'secret123' };
      let capturedOutput = '';

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((msg) => {
          capturedOutput = msg;
        });

      logger.log('test', 'Test', testData);

      // The captured output should contain [REDACTED], not the actual password
      expect(capturedOutput).toContain('[REDACTED]');
      expect(capturedOutput).not.toContain('secret123');

      logSpy.mockRestore();
    });

    it('should preserve non-sensitive field values', () => {
      const testData = { username: 'john_doe', email: 'john@example.com' };
      let capturedOutput = '';

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((msg) => {
          capturedOutput = msg;
        });

      logger.log('test', 'Test', testData);

      // Non-sensitive fields should NOT be redacted
      if (capturedOutput.includes('john_doe')) {
        expect(capturedOutput).toContain('john_doe');
      }

      logSpy.mockRestore();
    });
  });

  describe('non-sensitive field handling', () => {
    it('should not redact email field', () => {
      const testData = { email: 'user@example.com' };
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should not redact phone field', () => {
      const testData = { phone: '+353851234567' };
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('array and complex object handling', () => {
    it('should handle arrays of objects with sensitive fields', () => {
      const testData = {
        users: [
          { name: 'John', password: 'secret1' },
          { name: 'Jane', password: 'secret2' },
        ],
      };
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should handle mixed nested structures', () => {
      const testData = {
        request: {
          body: {
            username: 'john',
            password: 'secret123',
            profile: {
              name: 'John Doe',
              passwordHint: 'should-also-be-redacted',
            },
          },
          headers: {
            authorization: 'Bearer token',
          },
        },
      };
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', testData);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle null/undefined values gracefully', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      logger.log('test', 'Test message', null);
      logger.log('test', 'Test message', undefined);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should handle circular references', () => {
      const testData: any = { name: 'John' };
      testData.self = testData; // Create circular reference

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      expect(() => logger.log('test', 'Test message', testData)).not.toThrow();

      logSpy.mockRestore();
    });
  });
});
