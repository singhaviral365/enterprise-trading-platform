import { Logger } from '@nestjs/common';
import { NextFunction, Request, RequestHandler, Response, text } from 'express';
import { Envelope, EncryptionSettings, EnvelopeError, OpenedRequest } from './envelope';

/** The header that carries the envelope for a request with no body (a GET, or a POST that only relies on its cookie). */
export const ENVELOPE_HEADER = 'x-envelope';
export const ENVELOPE_CONTENT_TYPE = 'application/jose';

/** Never encrypted: probes, the key itself, and the interactive documentation. */
const EXCLUDED_PREFIXES: readonly string[] = ['/health', '/.well-known', '/api-docs'];

const JWKS_PATH = '/.well-known/jwks.json';

function problem(res: Response, status: number, code: string, message: string): void {
  // Before there is a key to answer with, the answer is plaintext and carries no payload: a code the client can act on.
  res.status(status).json({ errorCode: code, message });
}

function isExcluded(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * The envelope layer as Express middleware, so controllers, DTOs and the validation pipe keep seeing plain objects:
 *  - serves the public key at `/.well-known/jwks.json` (404 while encryption is off, which is how a browser learns not to encrypt);
 *  - opens an envelope (the body, or the `X-Envelope` header when there is no body) and replaces `req.body` with the plain JSON;
 *  - wraps `res.json` so the answer, errors included, goes back sealed to the browser that asked.
 * In `optional` mode a request without an envelope passes through unchanged; in `required` mode it is refused with
 * `ENCRYPTION_REQUIRED`. With encryption `off` the layer does nothing at all.
 */
export function encryptionMiddleware(settings: EncryptionSettings, envelope: Envelope | null): RequestHandler[] {
  if (settings.mode === 'off' || envelope === null) {
    return [
      (req: Request, res: Response, next: NextFunction) => {
        if (req.path === JWKS_PATH) {
          return problem(res, 404, 'ENCRYPTION_OFF', 'Payload encryption is not enabled');
        }
        next();
      },
    ];
  }
  const logger = new Logger('PayloadEncryption');

  const handler: RequestHandler = async (req, res, next) => {
    if (req.path === JWKS_PATH && req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(envelope.jwks());
      return;
    }
    if (isExcluded(req.path) || req.method === 'OPTIONS') {
      return next();
    }

    const path = req.originalUrl.split('?')[0];
    const isEnveloped = (req.headers['content-type'] ?? '').toLowerCase().startsWith(ENVELOPE_CONTENT_TYPE);
    const headerValue = req.headers[ENVELOPE_HEADER];
    const compact = isEnveloped ? (typeof req.body === 'string' ? req.body : '') : typeof headerValue === 'string' ? headerValue : null;

    if (compact === null || (isEnveloped && compact === '')) {
      if (settings.mode === 'required') {
        return problem(res, 400, 'ENCRYPTION_REQUIRED', 'This request must be sent as an encrypted payload');
      }
      return next();
    }

    let opened: OpenedRequest;
    try {
      opened = await envelope.open(compact, req.method, path);
    } catch (error) {
      if (error instanceof EnvelopeError) {
        // Only the code is logged: never what was sent.
        logger.warn(`${req.method} ${path} refused: ${error.code}`);
        return problem(res, error.code === 'ENCRYPTION_REPLAY' ? 409 : 400, error.code, error.message);
      }
      return next(error);
    }

    if (isEnveloped || opened.payload !== '') {
      try {
        req.body = opened.payload === '' ? {} : JSON.parse(opened.payload);
      } catch {
        return problem(res, 400, 'ENCRYPTION_INVALID', 'The encrypted payload is not JSON');
      }
      if (settings.logPlaintext) {
        logger.debug(`${req.method} ${path} request: ${opened.payload}`);
      }
    }

    const sendPlain = res.json.bind(res);
    res.json = ((body?: unknown) => {
      const plaintext = JSON.stringify(body ?? null);
      if (settings.logPlaintext) {
        logger.debug(`${req.method} ${path} response ${res.statusCode}: ${plaintext}`);
      }
      envelope
        .seal(plaintext, opened)
        .then((sealed) => {
          res.type(ENVELOPE_CONTENT_TYPE);
          res.send(sealed);
        })
        .catch(() => {
          // No usable response key: a plaintext problem with a code, never the payload.
          res.status(400);
          sendPlain({ errorCode: 'ENCRYPTION_INVALID', message: 'The response key is not usable' });
        });
      return res;
    }) as Response['json'];
    next();
  };

  // The body of an enveloped request is text until it is opened; the JSON parser leaves application/jose alone.
  return [text({ type: ENVELOPE_CONTENT_TYPE, limit: '1mb' }), handler];
}
