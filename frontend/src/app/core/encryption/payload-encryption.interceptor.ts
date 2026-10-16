import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, mergeMap, of, switchMap, throwError } from 'rxjs';

import {
  ENCRYPTED_ORIGINS,
  ENCRYPTION_ENABLED,
  ENCRYPTION_EXCLUDED_PATHS,
  ENVELOPE_CONTENT_TYPE,
  ENVELOPE_HEADER,
  PayloadEnvelope,
} from './payload-envelope';

/** Codes a service answers in plaintext when it could not open an envelope; one fresh key and one retry fixes them. */
const RETRYABLE_CODES: readonly string[] = ['ENCRYPTION_INVALID', 'ENCRYPTION_EXPIRED', 'ENCRYPTION_REQUIRED'];

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function isExcluded(path: string): boolean {
  return ENCRYPTION_EXCLUDED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** A body the envelope can carry: nothing, or JSON. Files and form data pass through unchanged. */
function isJsonBody(body: unknown): boolean {
  return (
    body === null ||
    typeof body === 'string' ||
    typeof body === 'number' ||
    typeof body === 'boolean' ||
    Array.isArray(body) ||
    (typeof body === 'object' && Object.getPrototypeOf(body) === Object.prototype)
  );
}

function isSealed(headers: { get(name: string): string | null }): boolean {
  return (headers.get('Content-Type') ?? '').toLowerCase().startsWith(ENVELOPE_CONTENT_TYPE);
}

function parseText(text: string | null): unknown {
  if (text === null || text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Wraps the body of a call to an encrypted service in a JWE and opens the sealed answer, so the generated clients and every call
 * site keep seeing plain objects. It sits innermost, after `authInterceptor`: the cookie, the CSRF header and the 401 renewal see a
 * plain request, and the renewed retry comes through here again with a new one-time id.
 *
 * A service that publishes no key is not encrypting, and its calls go out unchanged. One plaintext refusal that a fresh key
 * would fix (`ENCRYPTION_INVALID`, `ENCRYPTION_EXPIRED`, `ENCRYPTION_REQUIRED`) is retried once.
 */
export const payloadEncryptionInterceptor: HttpInterceptorFn = (req, next) => {
  const url = parseUrl(req.url);
  const origins = inject(ENCRYPTED_ORIGINS);
  const enabled = inject(ENCRYPTION_ENABLED);
  if (!enabled || url === null || !origins.includes(url.origin) || isExcluded(url.pathname) || !isJsonBody(req.body)) {
    return next(req);
  }
  const envelope = inject(PayloadEnvelope);
  const originalType = req.responseType;

  const attempt = (retried: boolean): Observable<HttpEvent<unknown>> =>
    from(envelope.serverKey(url.origin)).pipe(
      switchMap((server) => {
        if (server === null) {
          return retried ? next(req) : next(req).pipe(catchError((error: unknown) => retryIfRefused(error, retried)));
        }
        return from(envelope.seal(server, req.method, url.pathname, req.body ?? undefined)).pipe(
          switchMap(({ compact }) => {
            const sealed =
              req.body === null
                ? req.clone({ headers: req.headers.set(ENVELOPE_HEADER, compact), responseType: 'text' })
                : req.clone({
                    body: compact,
                    headers: req.headers.set('Content-Type', ENVELOPE_CONTENT_TYPE),
                    responseType: 'text',
                  });
            return next(sealed).pipe(
              mergeMap((event) => openEvent(event, originalType)),
              catchError((error: unknown) => openError(error).pipe(switchMap((opened) => retryIfRefused(opened, retried)))),
            );
          }),
        );
      }),
    );

  const retryIfRefused = (error: unknown, retried: boolean): Observable<never | HttpEvent<unknown>> => {
    const code = error instanceof HttpErrorResponse ? (error.error as { errorCode?: string } | null)?.errorCode : undefined;
    if (!retried && code !== undefined && RETRYABLE_CODES.includes(code)) {
      envelope.forget(url.origin);
      return attempt(true);
    }
    return throwError(() => error);
  };

  const openEvent = (event: HttpEvent<unknown>, type: HttpRequest<unknown>['responseType']): Observable<HttpEvent<unknown>> => {
    if (!(event instanceof HttpResponse)) {
      return of(event);
    }
    const text = typeof event.body === 'string' ? event.body : null;
    const plain$ = text !== null && isSealed(event.headers) ? from(envelope.open(text)) : of(text);
    return plain$.pipe(
      mergeMap((plain) => {
        const body = type === 'json' ? parseText(plain) : plain;
        return of(
          new HttpResponse({ body, headers: event.headers, status: event.status, statusText: event.statusText, url: event.url ?? undefined }),
        );
      }),
    );
  };

  /** Turns a failed call's body back into what the caller would have seen without the envelope: parsed JSON, opened if sealed. */
  const openError = (error: unknown): Observable<unknown> => {
    if (!(error instanceof HttpErrorResponse) || typeof error.error !== 'string') {
      return of(error);
    }
    const text = error.error;
    const plain$ = isSealed(error.headers) ? from(envelope.open(text)) : of(text);
    return plain$.pipe(
      mergeMap((plain) =>
        of(
          new HttpErrorResponse({
            error: parseText(plain),
            headers: error.headers,
            status: error.status,
            statusText: error.statusText,
            url: error.url ?? undefined,
          }),
        ),
      ),
      catchError(() => of(error)),
    );
  };

  return attempt(false);
};
