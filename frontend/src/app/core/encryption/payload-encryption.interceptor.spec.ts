import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CompactEncrypt, JWK, KeyLike, compactDecrypt, exportJWK, generateKeyPair, importJWK } from 'jose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_API_BASE_URL } from '../../api/api.config';
import { payloadEncryptionInterceptor } from './payload-encryption.interceptor';
import { ENCRYPTED_ORIGINS, ENCRYPTION_ENABLED } from './payload-envelope';

const KEYS = `${AUTH_API_BASE_URL}/.well-known/jwks.json`;
const LOGIN = `${AUTH_API_BASE_URL}/auth/login`;

/** The service's side of the envelope, played by the test. */
let serverPublic: JWK;
let serverPrivate: KeyLike | Uint8Array;

beforeAll(async () => {
  // The test DOM replaces `Uint8Array` with its own, and the crypto library (running on Node's) then rejects the bytes Node hands
  // it. A real browser has one realm; give the test the same.
  const node = (globalThis as unknown as { Buffer: { prototype: object } }).Buffer;
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(node.prototype).constructor);
  const pair = await generateKeyPair('RSA-OAEP-256', { modulusLength: 2048, extractable: true });
  serverPublic = { ...(await exportJWK(pair.publicKey)), kid: 'auth-test', alg: 'RSA-OAEP-256', use: 'enc' };
  serverPrivate = pair.privateKey;
});

afterAll(() => vi.unstubAllGlobals());

describe('payloadEncryptionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([payloadEncryptionInterceptor])),
        provideHttpClientTesting(),
        // The feature is off in a default build and on a page without Web Crypto; these tests are about it being on.
        { provide: ENCRYPTION_ENABLED, useValue: true },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const next = (matcher: string | ((r: { url: string }) => boolean)): Promise<TestRequest> =>
    vi.waitFor(() => (typeof matcher === 'string' ? httpMock.expectOne(matcher) : httpMock.expectOne(matcher)), { timeout: 5000 });

  const serveKey = async () => (await next(KEYS)).flush({ keys: [serverPublic] }, { headers: { Date: new Date().toUTCString() } });

  /** Opens what the browser sent, as the service would. */
  async function open(req: TestRequest) {
    const compact = req.request.body !== null ? (req.request.body as string) : (req.request.headers.get('X-Envelope') as string);
    const { plaintext, protectedHeader } = await compactDecrypt(compact, serverPrivate);
    return { text: new TextDecoder().decode(plaintext), header: protectedHeader };
  }

  /** Seals an answer to the key the browser put in the request, as the service would. */
  async function answer(header: Record<string, unknown>, body: unknown): Promise<string> {
    const key = await importJWK(header['epk_resp'] as JWK, 'ECDH-ES');
    return new CompactEncrypt(Uint8Array.from(new TextEncoder().encode(JSON.stringify(body))))
      .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM', jti: header['jti'] as string })
      .encrypt(key);
  }

  it('seals the body to the service and opens the sealed answer, so callers still see plain objects', async () => {
    let result: unknown;
    http.post(LOGIN, { username: 'alice', password: 'secret' }).subscribe((r) => (result = r));
    await serveKey();

    const req = await next(LOGIN);
    expect(req.request.headers.get('Content-Type')).toBe('application/jose');
    expect(JSON.stringify(req.request.body)).not.toContain('secret');
    const { text, header } = await open(req);
    expect(JSON.parse(text)).toEqual({ username: 'alice', password: 'secret' });
    expect(header).toMatchObject({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: 'auth-test', htm: 'POST', htu: '/auth/login' });
    expect(typeof header['jti']).toBe('string');
    expect(Math.abs((header['iat'] as number) - Date.now() / 1000)).toBeLessThan(5);

    req.flush(await answer(header, { user: 'alice' }), { headers: { 'Content-Type': 'application/jose' } });

    await vi.waitFor(() => expect(result).toEqual({ user: 'alice' }));
  });

  it('puts a body-less request in the X-Envelope header', async () => {
    let result: unknown;
    http.get(`${AUTH_API_BASE_URL}/auth/me`).subscribe((r) => (result = r));
    await serveKey();

    const req = await next(`${AUTH_API_BASE_URL}/auth/me`);
    const { text, header } = await open(req);
    expect(text).toBe('');
    expect(header).toMatchObject({ htm: 'GET', htu: '/auth/me' });

    req.flush(await answer(header, { username: 'alice' }), { headers: { 'Content-Type': 'application/jose' } });

    await vi.waitFor(() => expect(result).toEqual({ username: 'alice' }));
  });

  it('gives a sealed error body back as the parsed error a caller expects, with its status', async () => {
    let error: HttpErrorResponse | undefined;
    http.post(LOGIN, { username: 'a', password: 'wrong' }).subscribe({ error: (e) => (error = e) });
    await serveKey();
    const req = await next(LOGIN);
    const { header } = await open(req);

    req.flush(await answer(header, { errorCode: 'AUTH-401', message: 'Invalid credentials' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/jose' },
    });

    await vi.waitFor(() => expect(error?.status).toBe(401));
    expect(error?.error).toEqual({ errorCode: 'AUTH-401', message: 'Invalid credentials' });
  });

  it('uses a new one-time id for every request', async () => {
    http.post(LOGIN, { n: 1 }).subscribe();
    await serveKey();
    const first = await next(LOGIN);
    const one = (await open(first)).header['jti'];
    first.flush('', { headers: { 'Content-Type': 'text/plain' } });

    http.post(LOGIN, { n: 2 }).subscribe();
    const second = await next(LOGIN);
    const two = (await open(second)).header['jti'];
    second.flush('', { headers: { 'Content-Type': 'text/plain' } });

    expect(one).not.toBe(two);
  });

  it('sends the call unchanged when the service publishes no key (encryption off)', async () => {
    http.post(LOGIN, { username: 'a' }).subscribe();
    (await next(KEYS)).flush({ errorCode: 'ENCRYPTION_OFF' }, { status: 404, statusText: 'Not Found' });

    const req = await next(LOGIN);

    expect(req.request.body).toEqual({ username: 'a' });
    expect(req.request.headers.has('X-Envelope')).toBe(false);
    req.flush({});
  });

  it('refetches the key and retries once when the service says the envelope was for another key', async () => {
    let result: unknown;
    http.post(LOGIN, { n: 1 }).subscribe((r) => (result = r));
    await serveKey();
    (await next(LOGIN)).flush({ errorCode: 'ENCRYPTION_INVALID', message: 'x' }, { status: 400, statusText: 'Bad Request' });

    await serveKey();
    const retry = await next(LOGIN);
    const { header } = await open(retry);
    retry.flush(await answer(header, { ok: true }), { headers: { 'Content-Type': 'application/jose' } });

    await vi.waitFor(() => expect(result).toEqual({ ok: true }));
  });

  it('does not retry a second time', async () => {
    let error: HttpErrorResponse | undefined;
    http.post(LOGIN, { n: 1 }).subscribe({ error: (e) => (error = e) });
    await serveKey();
    (await next(LOGIN)).flush({ errorCode: 'ENCRYPTION_EXPIRED' }, { status: 400, statusText: 'Bad Request' });
    await serveKey();
    (await next(LOGIN)).flush({ errorCode: 'ENCRYPTION_EXPIRED' }, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() => expect(error?.error).toEqual({ errorCode: 'ENCRYPTION_EXPIRED' }));
  });

  it('leaves other origins, the key request and the probes alone', async () => {
    http.post('https://api.example.com/orders', { a: 1 }).subscribe();
    http.get(`${AUTH_API_BASE_URL}/health`).subscribe();

    const orders = httpMock.expectOne('https://api.example.com/orders');
    const health = httpMock.expectOne(`${AUTH_API_BASE_URL}/health`);

    expect(orders.request.body).toEqual({ a: 1 });
    expect(health.request.headers.has('X-Envelope')).toBe(false);
    orders.flush({});
    health.flush({});
  });

  it('leaves a file upload alone', async () => {
    http.post(LOGIN, new FormData()).subscribe();

    const req = httpMock.expectOne(LOGIN);

    expect(req.request.body).toBeInstanceOf(FormData);
    req.flush({});
  });

  it('covers only the origins it is given', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([payloadEncryptionInterceptor])),
        provideHttpClientTesting(),
        { provide: ENCRYPTION_ENABLED, useValue: true },
        { provide: ENCRYPTED_ORIGINS, useValue: ['https://other.example'] },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const mock = TestBed.inject(HttpTestingController);

    client.post(LOGIN, { a: 1 }).subscribe();

    mock.expectOne(LOGIN).flush({});
    mock.verify();
  });

  it('asks for no key and sends the call as it is when encryption is off (not built in, or no Web Crypto on this page)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([payloadEncryptionInterceptor])),
        provideHttpClientTesting(),
        { provide: ENCRYPTION_ENABLED, useValue: false },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const mock = TestBed.inject(HttpTestingController);

    client.post(LOGIN, { a: 1 }).subscribe();

    const req = mock.expectOne(LOGIN);
    expect(req.request.body).toEqual({ a: 1 });
    expect(req.request.headers.has('X-Envelope')).toBe(false);
    req.flush({});
    mock.expectNone(KEYS);
    mock.verify();
  });
});
