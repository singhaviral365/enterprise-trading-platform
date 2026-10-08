import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { CompactEncrypt, JWK, KeyLike, compactDecrypt, exportJWK, generateKeyPair, importJWK } from 'jose';
import { encryptionMiddleware } from './encryption.middleware';
import {
  EncryptionSettings,
  Envelope,
  ReplayCache,
  assertEncryptionSettings,
  encryptionSettings,
  generateRsaPrivateKeyPem,
} from './envelope';

jest.setTimeout(30_000);

let pem: string;

beforeAll(async () => {
  pem = await generateRsaPrivateKeyPem();
});

function settings(mode: EncryptionSettings['mode'], extra: Partial<EncryptionSettings> = {}): EncryptionSettings {
  return { mode, privateKeyPem: pem, kid: 'auth-test', maxAgeSeconds: 60, logPlaintext: false, ...extra };
}

/** A stand-in for the browser: encrypts to the published key and opens the sealed answer. */
class Browser {
  private responseKeys!: { publicJwk: JWK; privateKey: KeyLike | Uint8Array };

  constructor(private readonly base: string) {}

  async start(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair('ECDH-ES', { crv: 'P-256' });
    this.responseKeys = { publicJwk: await exportJWK(publicKey), privateKey };
  }

  async serverKey() {
    const jwks = (await (await fetch(`${this.base}/.well-known/jwks.json`)).json()) as { keys: JWK[] };
    return { jwk: jwks.keys[0], key: await importJWK(jwks.keys[0], 'RSA-OAEP-256') };
  }

  async envelope(method: string, path: string, body: unknown, overrides: Record<string, unknown> = {}): Promise<string> {
    const { jwk, key } = await this.serverKey();
    return new CompactEncrypt(new TextEncoder().encode(body === undefined ? '' : JSON.stringify(body)))
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        kid: jwk.kid,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        htm: method,
        htu: path,
        epk_resp: this.responseKeys.publicJwk,
        ...overrides,
      })
      .encrypt(key);
  }

  async open(response: Response): Promise<unknown> {
    const sealed = await response.text();
    const { plaintext } = await compactDecrypt(sealed, this.responseKeys.privateKey);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }
}

async function serve(config: EncryptionSettings): Promise<{ base: string; server: Server }> {
  const app = express();
  const envelope = config.mode === 'off' ? null : await Envelope.create(config);
  for (const handler of encryptionMiddleware(config, envelope)) {
    app.use(handler);
  }
  app.use(express.json());
  app.post('/auth/login', (req, res) => {
    if (req.body.password === 'wrong') {
      res.status(401).json({ errorCode: 'AUTH-401', message: 'Invalid credentials' });
      return;
    }
    res.json({ user: req.body.username, received: req.body });
  });
  app.get('/auth/me', (_req, res) => res.json({ username: 'alice' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

describe('payload encryption', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function start(config: EncryptionSettings) {
    const started = await serve(config);
    server = started.server;
    const browser = new Browser(started.base);
    if (config.mode !== 'off') {
      await browser.start();
    }
    return { base: started.base, browser };
  }

  const post = (base: string, sealed: string) =>
    fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/jose' }, body: sealed });

  describe('required mode', () => {
    it('opens a sealed request and seals the answer to the browser, so a body never travels in the clear', async () => {
      const { base, browser } = await start(settings('required'));
      const sealed = await browser.envelope('POST', '/auth/login', { username: 'alice', password: 'secret' });
      expect(sealed).not.toContain('secret');

      const res = await post(base, sealed);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/jose');
      expect(await browser.open(res)).toEqual({ user: 'alice', received: { username: 'alice', password: 'secret' } });
    });

    it('seals error answers too, keeping their status', async () => {
      const { base, browser } = await start(settings('required'));
      const res = await post(base, await browser.envelope('POST', '/auth/login', { username: 'a', password: 'wrong' }));

      expect(res.status).toBe(401);
      expect(await browser.open(res)).toEqual({ errorCode: 'AUTH-401', message: 'Invalid credentials' });
    });

    it('carries the envelope of a request with no body in the X-Envelope header', async () => {
      const { base, browser } = await start(settings('required'));
      const res = await fetch(`${base}/auth/me`, { headers: { 'X-Envelope': await browser.envelope('GET', '/auth/me', undefined) } });

      expect(res.status).toBe(200);
      expect(await browser.open(res)).toEqual({ username: 'alice' });
    });

    it('refuses plaintext with ENCRYPTION_REQUIRED', async () => {
      const { base } = await start(settings('required'));
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a', password: 'b' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ errorCode: 'ENCRYPTION_REQUIRED' });
    });

    it('leaves the probes alone', async () => {
      const { base } = await start(settings('required'));
      expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: 'ok' });
    });

    it('refuses a tampered payload', async () => {
      const { base, browser } = await start(settings('required'));
      const sealed = await browser.envelope('POST', '/auth/login', { username: 'a', password: 'b' });
      const parts = sealed.split('.');
      parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');

      const res = await post(base, parts.join('.'));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
    });

    it('refuses an envelope made for another path or method', async () => {
      const { base, browser } = await start(settings('required'));

      const otherPath = await post(base, await browser.envelope('POST', '/auth/register', { a: 1 }));
      const otherMethod = await post(base, await browser.envelope('PUT', '/auth/login', { a: 1 }));

      expect(await otherPath.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
      expect(await otherMethod.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
    });

    it('refuses a replayed envelope', async () => {
      const { base, browser } = await start(settings('required'));
      const sealed = await browser.envelope('POST', '/auth/login', { username: 'a', password: 'b' });

      expect((await post(base, sealed)).status).toBe(200);
      const again = await post(base, sealed);

      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ errorCode: 'ENCRYPTION_REPLAY' });
    });

    it('refuses an envelope that is too old or from the future', async () => {
      const { base, browser } = await start(settings('required'));
      const old = await post(base, await browser.envelope('POST', '/auth/login', {}, { iat: Math.floor(Date.now() / 1000) - 3600 }));
      const future = await post(base, await browser.envelope('POST', '/auth/login', {}, { iat: Math.floor(Date.now() / 1000) + 3600 }));

      expect(await old.json()).toMatchObject({ errorCode: 'ENCRYPTION_EXPIRED' });
      expect(await future.json()).toMatchObject({ errorCode: 'ENCRYPTION_EXPIRED' });
    });

    it('refuses an envelope made for another key id', async () => {
      const { base, browser } = await start(settings('required'));
      const res = await post(base, await browser.envelope('POST', '/auth/login', {}, { kid: 'someone-else' }));

      expect(await res.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
    });

    it('refuses an id that is too short to be random', async () => {
      const { base, browser } = await start(settings('required'));
      const res = await post(base, await browser.envelope('POST', '/auth/login', {}, { jti: '1' }));

      expect(await res.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
    });

    it('says plainly when the request carries no key to answer to', async () => {
      const { base, browser } = await start(settings('required'));
      const res = await post(base, await browser.envelope('POST', '/auth/login', { a: 1 }, { epk_resp: undefined }));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ errorCode: 'ENCRYPTION_INVALID' });
    });
  });

  describe('optional mode', () => {
    it('accepts plaintext and an envelope side by side', async () => {
      const { base, browser } = await start(settings('optional'));

      const plain = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a', password: 'b' }),
      });
      const sealed = await post(base, await browser.envelope('POST', '/auth/login', { username: 'b', password: 'c' }));

      expect(await plain.json()).toMatchObject({ user: 'a' });
      expect(await browser.open(sealed)).toMatchObject({ user: 'b' });
    });
  });

  describe('off mode', () => {
    it('does nothing, and publishes no key so a browser knows not to encrypt', async () => {
      const { base } = await start(settings('off'));

      expect((await fetch(`${base}/.well-known/jwks.json`)).status).toBe(404);
      const plain = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'a', password: 'b' }),
      });
      expect(await plain.json()).toMatchObject({ user: 'a' });
    });
  });

  it('publishes only the public half of the key, with its id', async () => {
    const { base } = await start(settings('required'));
    const jwks = (await (await fetch(`${base}/.well-known/jwks.json`)).json()) as { keys: Record<string, unknown>[] };

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', kid: 'auth-test', alg: 'RSA-OAEP-256', use: 'enc' });
    expect(jwks.keys[0]).not.toHaveProperty('d');
    expect(jwks.keys[0]).not.toHaveProperty('p');
  });
});

describe('settings', () => {
  it('defaults to off and parses the variables', () => {
    expect(encryptionSettings({}).mode).toBe('off');
    expect(encryptionSettings({ ENC_MODE: 'Required', ENC_KID: 'k1', ENC_MAX_AGE_SECONDS: '30' })).toMatchObject({
      mode: 'required',
      kid: 'k1',
      maxAgeSeconds: 30,
    });
    expect(encryptionSettings({ ENC_PRIVATE_KEY_PEM: 'a\\nb' }).privateKeyPem).toBe('a\nb');
  });

  it('rejects an unknown mode', () => {
    expect(() => encryptionSettings({ ENC_MODE: 'sometimes' })).toThrow('ENC_MODE');
  });

  it('refuses to start switched on without a key, and with plaintext logging in production', () => {
    expect(() => assertEncryptionSettings({ ...settings('optional'), privateKeyPem: null })).toThrow('ENC_PRIVATE_KEY_PEM');
    expect(() => assertEncryptionSettings(settings('required', { logPlaintext: true }), { NODE_ENV: 'production' })).toThrow('ENC_LOG_PLAINTEXT');
    expect(() => assertEncryptionSettings(settings('required', { logPlaintext: true }), { NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertEncryptionSettings({ ...settings('off'), privateKeyPem: null })).not.toThrow();
  });
});

describe('replay cache', () => {
  it('forgets an id once its lifetime has passed and caps its size', () => {
    const cache = new ReplayCache(1000, 2);

    expect(cache.remember('a', 0)).toBe(true);
    expect(cache.remember('a', 500)).toBe(false);
    expect(cache.remember('a', 1500)).toBe(true);
    cache.remember('b', 1500);
    cache.remember('c', 1500);
    expect(cache.remember('a', 1600)).toBe(true);
  });
});
