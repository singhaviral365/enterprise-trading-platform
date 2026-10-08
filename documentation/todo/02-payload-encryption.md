# 02 · Encrypting payloads between the frontend and the services

Status: **plan**. Nothing is implemented. This touches every service and the frontend HTTP layer, so it is split into
phases that each leave the application working.

## 1. Honest starting point (read this first)

You asked for my view rather than a rubber stamp, so here it is.

**What application-layer encryption on top of HTTPS does and does not give you.**

| It protects against | It does **not** protect against |
|---|---|
| Plaintext visible at a TLS-terminating hop you do not fully control (load balancer, CDN/WAF, API gateway, corporate proxy) | A malicious or compromised **frontend bundle**: the code that encrypts is delivered by the same origin, so whoever can alter the page can read data before it is encrypted |
| Payloads copied out of access logs, APM traces, request-dump debug tooling and captured traffic | An attacker who can both break TLS **and** replace the JavaScript (they would simply ship their own key) |
| A mis-configured deployment that serves HTTP by accident | XSS in the page, malware on the user's machine, a stolen session cookie used from another browser |
| Accidental logging of bodies by the services themselves | Data in the **URL** (path and query) and in headers, unless it is moved out of them |

So it is **defence in depth, not a replacement for HTTPS**, and its real value is the first row. That is a legitimate
goal ("prepare for the worst cases"), and it is worth doing well, provided we keep these rules, which are what
security practice recommends:

1. **Do not invent a scheme.** Use a standard envelope (JOSE / **JWE**, RFC 7516) with vetted libraries on both sides. No hand-rolled crypto, no raw RSA on payloads.
2. **Hybrid encryption, not "RSA the JSON".** RSA can only encrypt a few hundred bytes. A fresh random AES-256-GCM key encrypts the payload, and the public-key algorithm only wraps that key.
3. **Authenticated encryption only** (AES-GCM). Encrypt-only schemes allow tampering.
4. **Bind the ciphertext to its request** (method + path) and give it a short lifetime and a one-time id, so a captured request cannot be replayed or moved to another endpoint.
5. **Keys are managed**: private keys never in the repo or the image, identified by `kid`, rotatable without downtime.
6. **HTTPS, HSTS, `Secure` + `HttpOnly` cookies, a strict CSP and no inline scripts stay mandatory** (they are what actually protects the bundle and the cookies).

My recommendation is therefore: **do it, in phases, as an envelope around whole JSON bodies, with credentials first**
(section 4 explains why). If, after phase 1, the cost/benefit does not feel right, stopping there still removes the
highest-value exposure (passwords and one-time codes).

## 2. The scheme (one design, used by all services)

You said different algorithms per service would be acceptable. I recommend **not** doing that: the frontend would carry
several crypto paths, and both NestJS (`jose`) and Spring (Nimbus JOSE+JWT) support the same standard algorithms. One scheme
means one frontend interceptor and one test suite.

### 2.1 Request: browser -> service

| Item | Choice | Why |
|---|---|---|
| Format | **JWE**, compact serialisation, content type `application/jose` | Standard, self-describing (`alg`, `enc`, `kid`), libraries on every platform |
| Key wrap (`alg`) | **`RSA-OAEP-256`**, server key pair of **3072** bits | Available in Web Crypto (browser), `jose` (Node) and Nimbus (Java). OAEP with SHA-256 is the modern RSA padding; 3072 bits is the long-term recommendation |
| Content (`enc`) | **`A256GCM`** | Authenticated, hardware-accelerated, native in Web Crypto |
| Replay / binding | JWE protected header carries `iat`, `jti` (random 128-bit), `htm` (HTTP method), `htu` (path **without** host and query) | The header is authenticated as AAD, so changing any of it breaks decryption. Server checks `|now - iat| <= 60 s` and rejects a repeated `jti` (small in-memory TTL cache; Redis only if the service is scaled out) |
| Key discovery | `GET /.well-known/jwks.json` on each service (public keys only, `kid` in each) | Frontend caches it; supports rotation (two keys active during overlap) |

Alternative worth knowing: **ECDH-ES + A256GCM** (P-256) is smaller and faster than RSA. It is used for the response
direction below. Using it for the request too is possible, but RSA-OAEP keeps the server key easy to reason about and to
rotate. You can switch the request algorithm later without changing anything else, because `alg` is in the header.

### 2.2 Response: service -> browser

The service must encrypt to a key only that browser can open. Per request:
1. The browser generates (or reuses for the page session) an **ECDH P-256 key pair** via Web Crypto; the private key is
   **non-extractable** and lives in memory only.
2. The request's JWE protected header includes the client's public key as `epk_resp` (a JWK).
3. The service encrypts the response as a JWE with `alg=ECDH-ES`, `enc=A256GCM` to that key, with the same `jti` as the request
   (so a response cannot be paired with another request) and `Content-Type: application/jose`.
4. The browser decrypts, hands the plain JSON to the normal HTTP pipeline.

Reusing one key pair for the page session (rotate on login/logout) avoids generating a key per call; the binding to `jti`
keeps responses unique anyway.

### 2.3 Where the server public key comes from, and what that does for trust
The JWKS is fetched over HTTPS from the same origin. That is exactly as trustworthy as the page itself (see section 1).
Optional hardening for later: embed the key fingerprint at build time and have the interceptor refuse a JWKS that does not
match. That protects against a proxy that swaps keys but does not touch JavaScript, which is a realistic "worst case".

### 2.4 Libraries
| Side | Library |
|---|---|
| Browser | Web Crypto (`crypto.subtle`) with the `jose` package (works in browsers, small, no Node dependency) |
| auth-service (NestJS) | `jose` |
| order-service / executor-service (Spring) | `com.nimbusds:nimbus-jose-jwt` |

## 3. Where it plugs in, per side

| Side | Mechanism | Notes |
|---|---|---|
| Frontend | Functional `HttpInterceptorFn` `payloadEncryptionInterceptor`, registered next to `authInterceptor` in the app config | Works on the `HttpRequest`/`HttpResponse`, so the **generated OpenAPI clients and every call site stay unchanged**. Skips URLs on an exclusion list. Owns the JWKS cache and the response key pair |
| auth-service | A global NestJS **middleware** that decrypts the body (before `ValidationPipe`/DTOs), plus a global **interceptor** that encrypts the response | Controllers and DTOs see plain objects: no controller edits. Behind a `ENC_MODE` setting |
| order-service / executor-service | Spring `RequestBodyAdvice` (swap the input stream before Jackson) and `ResponseBodyAdvice` (encrypt after serialisation), or a servlet filter with request/response wrappers | Controllers and DTOs unchanged. Validation still runs on the decrypted object |

Because decryption happens before validation and encryption after serialisation, **business code, DTOs, OpenAPI contracts
(for the plain shape) and unit tests stay as they are**; new tests cover the envelope layer only.

## 4. How much to encrypt: whole body vs sensitive fields (decision D1)

| | Whole-body envelope (**recommended**) | Field-level encryption |
|---|---|---|
| What it is | The entire JSON body is one JWE | Only chosen fields (password, OTP, account number, balances ...) are replaced by ciphertext; JSON shape stays |
| Hides | Everything, including structure, field names and sizes (as far as possible) | Only the chosen fields |
| Easy to forget a field | **No**: new fields are protected automatically | **Yes**: every new field needs someone to remember |
| Code impact | One interceptor/middleware per side, zero per-endpoint code | A decorator or list per DTO on every service, plus matching frontend mapping |
| Intermediaries | They cannot validate/route on body content (they should not need to) | Gateways/WAF can still read the rest |
| Debuggability | Harder: you need the key or a debug mode | Easier |
| Downside | Slightly more CPU; bodies not readable in the browser dev tools unless a dev flag logs them | Metadata and non-listed fields are exposed |

Recommendation: **whole-body**, because the goal is "every payload", and because with field-level encryption the bug
you actually get is a forgotten field. Keep a **dev-only** `ENC_LOG_PLAINTEXT` switch on the server and a console helper in
the interceptor in development builds so people can still see what is going on (never enabled in `prod`).

### What an envelope cannot cover (decision D2)
- **URL path and query** (`/api/v1/accounts/{id}/orders?...`): routing needs them in the clear. Today they carry account ids and
  filters. Options: accept it (ids are not secrets by themselves, and authorisation is server-side), or move sensitive
  filters into POST bodies, or switch to opaque handles. Recommendation: **accept for now**, and add a rule that no secret,
  token, code, name or balance ever goes into a URL (already true today as far as I can see).
- **Headers**: `Authorization`/cookies, `X-Requested-With`, `Idempotency-Key` stay as they are.
- **Responses with no body** (`204`, redirects) have nothing to encrypt.

## 5. Per-service scope

Method/endpoint list is from `contracts/*.yaml`. "Body" means there is something to encrypt.

### 5.1 auth-service (`/auth/...`)  **phase 1, highest value**
| Endpoint | Request body | Response body |
|---|---|---|
| `POST /auth/register`, `/register/verify`, `/register/resend` | Yes (username, email, password, code) | Yes |
| `POST /auth/login`, `/login/verify`, `/login/resend` | Yes (credentials, code) | Yes (user, tokens or challenge) |
| `POST /auth/password/forgot`, `/resend`, `/verify`, `/reset` | Yes | Yes |
| `POST /auth/refresh`, `/auth/logout` | Cookie only | Small body |
| `GET /auth/me` | No | Yes (username, email, 2FA flag) |
| `PATCH/POST /auth/me/two-factor`, `/auth/me/password` | Yes | Yes |
| `GET /health` | No | **Excluded** (probes, no data) |

Session cookies are `HttpOnly`, so tokens do not travel in bodies already; the envelope mainly protects passwords, codes and the
profile.

### 5.2 order-service (`/api/v1/...`)  **phase 2**
| Area | Body? |
|---|---|
| `POST /orders`, `GET /orders/{id}`, `DELETE /orders/{id}` | Yes: order details, status |
| `GET /accounts/{id}`, `/balance`, `/positions`, `/orders` | Response: yes (balances, holdings, history) |
| `POST /accounts/create`, `/accounts/link` | Yes (holder name, account number) |
| `GET /portfolio/...` (positions, pnl, realised, performance) | Response: yes |
| `/accounts/{id}/notifications` (+ `/read`), `/preferences`, watchlist | Yes |
| `GET /health` | Excluded |

### 5.3 executor-service (`/api/v1/market/...`)  **phase 3, recommended to exclude (decision D3)**
`GET /market/quotes` and `/market/candles/{symbol}` return **public market data**: no user data, no credentials, and the
request has no body. Encrypting it adds cost and breaks edge caching without protecting anything personal. You asked that
any payload is encrypted, so the machinery will support it (just remove the exclusion), but my recommendation is to leave
it out unless there is a policy reason. The executor's other traffic is Kafka between services, not browser traffic.

## 6. Existing behaviour that must keep working (and how)

| Concern | Handling |
|---|---|
| **No big-bang** | `ENC_MODE=off | optional | required` per service. `off`: nothing changes (default). `optional`: server accepts and returns encrypted when the request says so (`Content-Type: application/jose`), plaintext otherwise. `required`: plaintext bodies are rejected `400 ENCRYPTION_REQUIRED`. Roll out `optional` first, switch the frontend on, then `required` |
| **Frontend flag** | `environment.encryption = { enabled, exclude: [...] }` so a build can turn it off |
| **OpenAPI contracts / generated clients** | Contracts keep describing the **plain** shape. Add one section in `contracts/CONTRACT-CHANGES.md` and a vendor extension `x-encrypted: true` on covered operations, plus the `application/jose` media type. `npm run api:generate` output does not change |
| **Errors** | Error bodies are encrypted too once decryption succeeded. Failures **before** decryption (bad JWE, wrong `kid`, replay, expired `iat`) return a small **plaintext** problem body with a stable code (`ENCRYPTION_INVALID`, `ENCRYPTION_REPLAY`, `ENCRYPTION_EXPIRED`) so the client can react (refetch JWKS, retry once) |
| **Key rotation mid-session** | Unknown `kid` -> server answers `ENCRYPTION_INVALID`; the interceptor refetches JWKS and retries **once** |
| **Clock skew** | `iat` window of 60 s, plus a server `Date` header the interceptor can use to correct a skewed client clock |
| **Existing interceptors** | Order in the chain: `payloadEncryption` runs **innermost** (closest to the network), so `authInterceptor` (cookies, 401 refresh) and the idempotency key still see plain requests |
| **401 refresh flow** | The refresh call is encrypted like any other; the retried request is re-encrypted with a **new `jti`** (never reuse a `jti`) |
| **Idempotency-Key** | Stays a header, unchanged; it is separate from `jti` |
| **File downloads, SSE, WebSockets** | None exist today; document that they are out of scope |
| **API documentation / Bruno collections** (`documentation/api`) | They post plain JSON. Provide a **dev-only** mode: with `ENC_MODE=optional` plaintext still works, so the collections keep working locally. In `required` (prod) they would need a small pre-request script; a note goes in the docs |
| **e2e tests** (Playwright) | Drive the real UI, so they exercise the encrypted path without changes. Add one test that asserts a captured request body is a JWE, not JSON |
| **Backend e2e/curl scripts** (`test_e2e.sh`, `.ps1`) | Run with `ENC_MODE=optional` or use plaintext; documented |
| **CORS** | New headers? None required (the `jti`/`htm` are inside the token). Only the new `Content-Type: application/jose` and the `/.well-known/jwks.json` GET must be allowed |
| **Size/perf** | JWE adds about 33% (base64url) plus ~500 bytes. RSA-OAEP-3072 decrypt is a few ms on the server per request. If that becomes a cost, add a **session key** step (one RSA exchange per login, then AES-GCM with a session key) as a later optimisation, not first |

## 7. Key management
- One key pair per service, **RSA 3072**, identified by `kid` (for example `auth-2026-10`).
- Private key: environment variable / secret store (`AUTH_ENC_PRIVATE_KEY_PEM`, `ORDER_ENC_PRIVATE_KEY_PEM`), never committed, never baked into the image. The service refuses to start in `optional`/`required` without it.
- Public key: derived and published by the service itself at `/.well-known/jwks.json` (`Cache-Control: public, max-age=300`).
- Rotation: add the new key (both active, new one used for publishing), wait one cache lifetime, retire the old one. Scripted: `scripts/gen-enc-key` (openssl or `jose` CLI) prints a PEM and its `kid`.
- Local development: a script writes throwaway dev keys to `.env` (git-ignored), and `.env.example` documents the variable names only.

## 8. Phases

| Phase | Work | Exit criterion |
|---|---|---|
| **0 Prerequisites** | Confirm HTTPS/HSTS and cookie flags in every deployment; add CSP; decide D1-D3; add `jose`/Nimbus; key script | Decisions recorded here |
| **1 auth-service** | Middleware + interceptor + JWKS endpoint + `ENC_MODE`; frontend interceptor with exclusion list set to "everything except /auth"; unit tests (round-trip, tamper, replay, wrong `htu`, expired, wrong `kid`) | Login, register, OTP, reset, change password work with `ENC_MODE=required` in a test run |
| **2 order-service** | `RequestBodyAdvice`/`ResponseBodyAdvice` + JWKS; same tests with Nimbus; frontend exclusion list drops the `/api/v1` entries | Orders, portfolio, notifications, settings work encrypted; Bruno collections still work in `optional` |
| **3 executor-service** | Decide D3; if included, same advice + JWKS on port 8082 | As decided |
| **4 Enforce** | Switch `ENC_MODE=required` in staging, then production; remove the plaintext fallback from the frontend for those routes | Plain requests are rejected; monitoring shows no `ENCRYPTION_*` errors from real clients |
| **5 Hardening (optional)** | Key fingerprint pinned in the build; session-key optimisation; Redis `jti` cache if the services are scaled out | |

## 9. Test plan
- **Shared test vectors**: generate JWEs with the Node implementation and decrypt them in Java (and the reverse) in CI, so the
  two libraries cannot drift apart.
- Unit (each side): round trip; tampered ciphertext/header; wrong `htm`/`htu`; expired and future `iat`; repeated `jti`;
  unknown `kid`; plaintext when `required`; encrypted when `off`.
- Contract: error codes and the plain-error shape.
- Frontend: interceptor spec with a fake `crypto.subtle`-backed key; retry-once on `ENCRYPTION_INVALID`; exclusion list;
  `jti` not reused on 401-refresh retry.
- e2e: the existing journeys unchanged, plus one assertion that the login request body is a JWE.

## 10. Decisions needed from you
| # | Question | My recommendation |
|---|---|---|
| D1 | Whole-body envelope or field-level? | Whole-body |
| D2 | Accept ids and filters in URLs for now? | Yes, with the "no secrets in URLs" rule |
| D3 | Encrypt the executor's public market data? | No (leave it out; the mechanism supports it if a policy requires it) |
| D4 | One algorithm set for all services, or different per service? | One (RSA-OAEP-256 + A256GCM for requests, ECDH-ES + A256GCM for responses) |
| D5 | Is stopping after phase 1 acceptable if the cost/benefit looks poor? | Yes: phase 1 removes passwords and codes from any plaintext path |

## 11. Risks
- **False sense of security**: it must not be used as a reason to relax TLS, CSP, cookie flags or authorisation checks.
- **Operational**: lost or leaked private key means a rotation procedure must already exist (section 7).
- **Developer friction**: harder to read traffic; mitigated by the dev logging switch and the `optional` mode.
- **Scope creep across three services**: mitigated by the phase gates and the shared envelope code (one small module per language).
