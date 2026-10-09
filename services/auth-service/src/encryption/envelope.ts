import { requiredInt } from '../config/required-settings';
import { CompactEncrypt, JWK, KeyLike, compactDecrypt, exportJWK, generateKeyPair, exportPKCS8, importJWK, importPKCS8, importSPKI } from 'jose';
import { createPublicKey } from 'crypto';

/**
 * The payload envelope (documentation/todo/02-payload-encryption.md): a standard JWE around a whole JSON body, so that a
 * TLS-terminating hop, an access log or a request dump never sees a password or a code.
 *
 * - request: `RSA-OAEP-256` + `A256GCM` to the service's public key. The protected header (which is authenticated, so it cannot be
 *   altered) carries `iat`, a one-time `jti`, the HTTP method `htm`, the path `htu` and the browser's response key `epk_resp`.
 * - response: `ECDH-ES` + `A256GCM` to that `epk_resp`, with the request's `jti`, so only that browser can open it.
 */

export type EncryptionMode = 'off' | 'optional' | 'required';

export interface EncryptionSettings {
  readonly mode: EncryptionMode;
  /** The RSA private key as PKCS#8 PEM (never logged), or null when none is configured. */
  readonly privateKeyPem: string | null;
  readonly kid: string;
  /** How far `iat` may be from the server's clock, in seconds. */
  readonly maxAgeSeconds: number;
  /** Development only: log the decrypted request and response bodies. Refused in production. */
  readonly logPlaintext: boolean;
}

const MODES: readonly EncryptionMode[] = ['off', 'optional', 'required'];

export function encryptionSettings(env: NodeJS.ProcessEnv = process.env): EncryptionSettings {
  const raw = (env.ENC_MODE ?? '').trim().toLowerCase();
  if (raw !== '' && !MODES.includes(raw as EncryptionMode)) {
    throw new Error(`ENC_MODE must be one of ${MODES.join(', ')} (got "${env.ENC_MODE}").`);
  }
  const pem = (env.ENC_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
  return {
    mode: (raw || 'off') as EncryptionMode,
    privateKeyPem: pem.length > 0 ? pem : null,
    kid: (env.ENC_KID ?? '').trim(),
    maxAgeSeconds: raw === '' || raw === 'off' ? 0 : requiredInt('ENC_MAX_AGE_SECONDS', 'encryption.max-age-seconds', env),
    logPlaintext: env.ENC_LOG_PLAINTEXT === 'true',
  };
}

/** Stops the service starting with encryption switched on but unusable, or with plaintext logging in production. */
export function assertEncryptionSettings(settings: EncryptionSettings, env: NodeJS.ProcessEnv = process.env): void {
  if (settings.mode !== 'off' && settings.kid === '') {
    throw new Error(`ENC_MODE=${settings.mode} needs ENC_KID: fill in encryption.kid in config/application.yml.`);
  }
  if (settings.mode !== 'off' && settings.privateKeyPem === null) {
    throw new Error(
      `ENC_MODE=${settings.mode} needs ENC_PRIVATE_KEY_PEM (an RSA 3072 private key, PKCS#8 PEM). Generate one with ` +
        '`npm run enc:keygen`, keep it in the environment or a secret store, never in git.',
    );
  }
  if (settings.logPlaintext && ['production', 'prod', 'staging'].includes((env.NODE_ENV || '').toLowerCase())) {
    throw new Error('ENC_LOG_PLAINTEXT=true is for development only: it is refused when NODE_ENV is production, prod or staging.');
  }
}

/** A problem found before the body could be decrypted; the caller turns it into a small plaintext answer with this code. */
export class EnvelopeError extends Error {
  constructor(
    readonly code: 'ENCRYPTION_INVALID' | 'ENCRYPTION_EXPIRED' | 'ENCRYPTION_REPLAY' | 'ENCRYPTION_REQUIRED',
    message: string,
  ) {
    super(message);
  }
}

export interface OpenedRequest {
  readonly payload: string;
  readonly jti: string;
  /** The browser's public key to encrypt the response to, or null when the request did not carry one. */
  readonly responseKey: JWK | null;
}

/** One-time ids: a `jti` seen again inside its lifetime is a replay. Small and in memory; a second instance would need Redis. */
export class ReplayCache {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 100_000,
  ) {}

  /** @return false when the id was already used */
  remember(jti: string, now: number): boolean {
    this.prune(now);
    if (this.seen.has(jti)) {
      return false;
    }
    if (this.seen.size >= this.maxEntries) {
      this.seen.delete(this.seen.keys().next().value as string);
    }
    this.seen.set(jti, now + this.ttlMs);
    return true;
  }

  private prune(now: number): void {
    for (const [id, expires] of this.seen) {
      if (expires > now) {
        break; // entries are inserted in time order, so the first live one ends the sweep
      }
      this.seen.delete(id);
    }
  }
}

export class Envelope {
  private constructor(
    private readonly settings: EncryptionSettings,
    private readonly privateKey: KeyLike,
    private readonly publicJwk: JWK,
    private readonly replay: ReplayCache,
    private readonly clock: () => number,
  ) {}

  static async create(settings: EncryptionSettings, clock: () => number = Date.now): Promise<Envelope> {
    if (settings.privateKeyPem === null) {
      throw new Error('An envelope needs a private key.');
    }
    const privateKey = await importPKCS8(settings.privateKeyPem, 'RSA-OAEP-256');
    const publicKey = createPublicKey(settings.privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
    const jwk = await exportJWK(await importSPKI(publicKey, 'RSA-OAEP-256'));
    const publicJwk: JWK = { ...jwk, kid: settings.kid, use: 'enc', alg: 'RSA-OAEP-256' };
    // A request is accepted for `maxAge` either side of now, so its id must be remembered for twice that.
    return new Envelope(settings, privateKey, publicJwk, new ReplayCache(settings.maxAgeSeconds * 2000), clock);
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  /**
   * Decrypts a request envelope and checks it is for this request: right key, right method and path, fresh, never seen before.
   * Throws {@link EnvelopeError}; the reason given never echoes what was sent.
   */
  async open(compact: string, method: string, path: string): Promise<OpenedRequest> {
    let result;
    try {
      result = await compactDecrypt(compact, this.privateKey, {
        keyManagementAlgorithms: ['RSA-OAEP-256'],
        contentEncryptionAlgorithms: ['A256GCM'],
      });
    } catch {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The encrypted payload could not be read');
    }
    const header = result.protectedHeader as Record<string, unknown>;
    if (header.kid !== this.settings.kid) {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The encrypted payload was made for another key');
    }
    if (typeof header.htm !== 'string' || header.htm.toUpperCase() !== method.toUpperCase() || header.htu !== path) {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The encrypted payload was made for another request');
    }
    const jti = header.jti;
    const iat = header.iat;
    if (typeof jti !== 'string' || jti.length < 16 || jti.length > 128 || typeof iat !== 'number') {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The encrypted payload is missing its id or time');
    }
    const now = this.clock();
    if (Math.abs(now / 1000 - iat) > this.settings.maxAgeSeconds) {
      throw new EnvelopeError('ENCRYPTION_EXPIRED', 'The encrypted payload is too old or from the future; check the clock');
    }
    if (!this.replay.remember(jti, now)) {
      throw new EnvelopeError('ENCRYPTION_REPLAY', 'The encrypted payload was already used');
    }
    const key = header.epk_resp;
    const responseKey = key !== null && typeof key === 'object' ? (key as JWK) : null;
    return { payload: new TextDecoder().decode(result.plaintext), jti, responseKey };
  }

  /** Encrypts a response body to the browser's key, tied to the request by its `jti`. */
  async seal(plaintext: string, request: OpenedRequest): Promise<string> {
    if (request.responseKey === null) {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The request carried no response key');
    }
    let key: KeyLike | Uint8Array;
    try {
      key = await importJWK({ ...request.responseKey, alg: 'ECDH-ES' }, 'ECDH-ES');
    } catch {
      throw new EnvelopeError('ENCRYPTION_INVALID', 'The response key is not usable');
    }
    return new CompactEncrypt(new TextEncoder().encode(plaintext))
      .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM', jti: request.jti })
      .encrypt(key);
  }
}

/** A throwaway RSA key as PKCS#8 PEM, for `npm run enc:keygen` and tests. */
export async function generateRsaPrivateKeyPem(): Promise<string> {
  const { privateKey } = await generateKeyPair('RSA-OAEP-256', { modulusLength: 3072, extractable: true });
  return exportPKCS8(privateKey);
}
