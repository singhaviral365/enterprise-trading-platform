import { HttpBackend, HttpClient } from '@angular/common/http';
import { InjectionToken, Service, inject } from '@angular/core';
import { CompactEncrypt, JWK, KeyLike, compactDecrypt, exportJWK, importJWK } from 'jose';
import { firstValueFrom } from 'rxjs';

import { AUTH_API_BASE_URL } from '../../api/api.config';

/**
 * Which services get their payloads wrapped in an envelope (documentation/todo/02-payload-encryption.md). Phase 1 is the Auth
 * service, where the passwords and one-time codes travel. A service is added here when it publishes a key.
 */
export const ENCRYPTED_ORIGINS = new InjectionToken<readonly string[]>('ENCRYPTED_ORIGINS', {
  factory: () => [new URL(AUTH_API_BASE_URL, window.location.origin).origin],
});

/** Left alone even on an encrypted origin: probes, the key itself and the interactive documentation. */
export const ENCRYPTION_EXCLUDED_PATHS: readonly string[] = ['/health', '/.well-known', '/api-docs'];

export const ENVELOPE_CONTENT_TYPE = 'application/jose';
export const ENVELOPE_HEADER = 'X-Envelope';

/** UTF-8 bytes as a plain `Uint8Array` of this realm, which is what the crypto library checks for. */
const bytes = (text: string): Uint8Array => Uint8Array.from(new TextEncoder().encode(text));

/** How long "this service does not encrypt" is believed before the key is asked for again. */
const UNAVAILABLE_FOR_MS = 300_000;

export interface ServerKey {
  readonly kid: string;
  readonly key: KeyLike | Uint8Array;
  /** The server's clock minus ours, from the `Date` header of the key response, so a skewed clock does not expire every request. */
  readonly skewMs: number;
}

interface ResponseKeys {
  readonly publicJwk: JWK;
  readonly privateKey: CryptoKey;
}

/** A sealed request: what to send, and the id its answer will carry. */
export interface SealedRequest {
  readonly compact: string;
}

/**
 * The browser's half of the envelope: fetches the service's public key (and learns from its absence that a service is not
 * encrypting), seals requests to it, and opens the answers with a response key that never leaves this page.
 *
 * Request: RSA-OAEP-256 + A256GCM, header `iat`, a one-time `jti`, the method `htm`, the path `htu` and our `epk_resp`.
 * Response: ECDH-ES + A256GCM to `epk_resp`. The ECDH private key is non-extractable and lives only in memory.
 */
@Service()
export class PayloadEnvelope {
  private readonly http = new HttpClient(inject(HttpBackend));
  private serverKeys = new Map<string, { value: Promise<ServerKey | null>; at: number }>();
  private responseKeys: Promise<ResponseKeys> | null = null;

  /** The service's key, or null when that service does not encrypt (or cannot be reached right now). */
  serverKey(origin: string): Promise<ServerKey | null> {
    const known = this.serverKeys.get(origin);
    if (known) {
      return known.value;
    }
    const value = this.fetchServerKey(origin);
    this.serverKeys.set(origin, { value, at: Date.now() });
    // A failure or an absent key is not remembered for long: the service may be switched on, or come back.
    void value.then((key) => {
      if (key === null) {
        setTimeout(() => this.serverKeys.delete(origin), UNAVAILABLE_FOR_MS);
      }
    });
    return value;
  }

  /** Forget a service's key, so the next request fetches it again (after a rotation, or a switch from off to on). */
  forget(origin: string): void {
    this.serverKeys.delete(origin);
  }

  private async fetchServerKey(origin: string): Promise<ServerKey | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ keys: JWK[] }>(`${origin}/.well-known/jwks.json`, { observe: 'response' }),
      );
      const jwk = response.body?.keys?.[0];
      if (!jwk?.kid) {
        return null;
      }
      const date = Date.parse(response.headers.get('Date') ?? '');
      return {
        kid: jwk.kid,
        key: await importJWK(jwk, 'RSA-OAEP-256'),
        skewMs: Number.isFinite(date) ? date - Date.now() : 0,
      };
    } catch {
      return null;
    }
  }

  private responseKey(): Promise<ResponseKeys> {
    this.responseKeys ??= crypto.subtle
      .generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
      .then(async (pair) => ({ publicJwk: await exportJWK(pair.publicKey), privateKey: pair.privateKey }));
    return this.responseKeys;
  }

  /** Seals a request for `method` and `path`. `body` is the JSON value, or undefined when the request has none. */
  async seal(server: ServerKey, method: string, path: string, body: unknown): Promise<SealedRequest> {
    const response = await this.responseKey();
    const compact = await new CompactEncrypt(bytes(body === undefined ? '' : JSON.stringify(body)))
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        kid: server.kid,
        iat: Math.floor((Date.now() + server.skewMs) / 1000),
        jti: crypto.randomUUID(),
        htm: method.toUpperCase(),
        htu: path,
        epk_resp: response.publicJwk,
      })
      .encrypt(server.key);
    return { compact };
  }

  /** Opens a sealed answer into its text. Throws when it was not made for this page. */
  async open(compact: string): Promise<string> {
    const { privateKey } = await this.responseKey();
    const { plaintext } = await compactDecrypt(compact, privateKey, {
      keyManagementAlgorithms: ['ECDH-ES'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    return new TextDecoder().decode(plaintext);
  }
}
