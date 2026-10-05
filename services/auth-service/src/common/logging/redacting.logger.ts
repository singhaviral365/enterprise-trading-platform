import { Injectable, Logger } from '@nestjs/common';

/**
 * Redacting Logger that masks sensitive fields at any depth in objects.
 * Sensitive keys: password, password_hash, passwordHash, secret, token, etc.
 */
@Injectable()
export class RedactingLogger {
  private logger = new Logger();
  private readonly sensitiveKeys = new Set([
    'password',
    'password_hash',
    'passwordHash',
    'secret',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'api_key',
    'apiKey',
    'jwt',
  ]);

  /**
   * Deep clone and redact sensitive values in an object
   */
  private redactObject(obj: any, depth = 0): any {
    if (depth > 10) return '[CIRCULAR_REFERENCE]';

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return obj.map((item) => this.redactObject(item, depth + 1));
      }

      const redacted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSensitiveKey(key)) {
          redacted[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          redacted[key] = this.redactObject(value, depth + 1);
        } else {
          redacted[key] = value;
        }
      }
      return redacted;
    }

    return obj;
  }

  /**
   * Check if a key name indicates sensitive data
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    for (const sensitiveKey of this.sensitiveKeys) {
      if (lowerKey.includes(sensitiveKey)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Format value for safe logging
   */
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(this.redactObject(value), null, 2);
    } catch (e) {
      return String(value);
    }
  }

  debug(context: string, message: string, data?: any): void {
    const formatted = data ? this.formatValue(data) : '';
    this.logger.debug(`[${context}] ${message} ${formatted}`);
  }

  log(context: string, message: string, data?: any): void {
    const formatted = data ? this.formatValue(data) : '';
    this.logger.log(`[${context}] ${message} ${formatted}`);
  }

  warn(context: string, message: string, data?: any): void {
    const formatted = data ? this.formatValue(data) : '';
    this.logger.warn(`[${context}] ${message} ${formatted}`);
  }

  error(context: string, message: string, data?: any): void {
    const formatted = data ? this.formatValue(data) : '';
    this.logger.error(`[${context}] ${message} ${formatted}`);
  }
}
