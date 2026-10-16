# Session tokens in HttpOnly cookies

Before: the Angular app received the access and refresh tokens from `POST /auth/login`, kept them in `localStorage`
(`auth.session`) and attached the access token as `Authorization: Bearer ...`. Any script running on the page (an XSS
bug, a compromised dependency) could read both tokens and walk away with the session.

Now: the Auth service puts the tokens in **HttpOnly cookies**. The browser stores and sends them; JavaScript cannot read
them. `localStorage` keeps only the username and when the access cookie expires (for the UI), nothing secret.

## Your questions

**"HttpOnly cookies are encrypted, I believe."** Not quite. A cookie is plain text on its way to and from the
browser. What the flags do:

| Flag | What it gives you |
|---|---|
| `HttpOnly` | Scripts cannot read it (`document.cookie` does not show it). This is the whole point: XSS can still *make requests* as the user while the page is open, but can no longer **steal the token** and use it elsewhere |
| `Secure` | Only sent over HTTPS, so it is not readable on the network. Encryption in transit is TLS, not the cookie |
| `SameSite=Strict` | Not sent on requests started by another site, the main defence against CSRF |

The access token is a **signed** JWT, not an encrypted one: anyone holding it can read the payload (user id, roles),
they just cannot forge or alter it. That is true whether it travels in a cookie, a header or `localStorage`.

**"Does the refresh token really need to be in the cookie? Can it live in the DB and be fetched on refresh?"** It
already lives in the DB, as a SHA-256 *hash* (`refresh_tokens.token_hash`), so it can be validated, rotated and revoked.
But the server still needs the client to **present something** on refresh: by then the access token is expired (that is
why the client is refreshing), so there is no authenticated identity to look "the user's token" up by. Whatever the
client presents is, by definition, the credential. The options are the same thing under different names:

| Design | Client holds | Server holds |
|---|---|---|
| **This one** (opaque refresh token) | refresh token in an HttpOnly cookie | its hash, per token |
| Server-side session | a session id in an HttpOnly cookie | the session row |

So the cookie is not redundant, it is the credential. What changed is only **who can read it**: now just the browser,
and it is scoped to `Path=/auth` so it is only ever sent to `/auth/refresh` and `/auth/logout`, never to the trading
APIs.

**"Does it degrade performance? Is that why it is in storage/cookie?"** No, and the split is deliberate:

- the **access token is stateless** (a JWT the order-service verifies with the shared secret): no database read on
  *any* API request. That is the performance reason JWTs exist;
- the **refresh token is stateful**: one indexed lookup by hash, at most once per 15 minutes per active user. That cost
  is negligible and buys revocation, rotation (a token works once) and theft detection.

The thing that *would* hurt is checking the database on every request, which is what a plain server session does and
what the short-lived JWT avoids.

## How it works

| Step | What happens |
|---|---|
| Login | `POST /auth/login` returns the usual body **and** `Set-Cookie: access_token` (path `/`, 15 min) and `refresh_token` (path `/auth`, 7 days), both HttpOnly |
| API calls | The app sends calls to the platform APIs with `withCredentials`; the browser adds the cookie. `ApiAuthenticationFilter` (order-service) and `JwtAuthGuard` (auth-service) read the JWT from `Authorization: Bearer` if present, otherwise from the `access_token` cookie |
| Expiry | The interceptor renews the session shortly before `expiresAt`, or once after a `401`, by calling `POST /auth/refresh` with **no body**; the service reads the `refresh_token` cookie, rotates it and sets fresh cookies |
| Logout | `POST /auth/logout` revokes the refresh token in the DB and expires both cookies (script cannot delete HttpOnly cookies, so the server must). The UI signs out immediately and does not wait for it |
| Multiple tabs | A Web Lock serialises refreshes; the loser sees the session's `expiresAt` moved on in `localStorage` and skips its own refresh (the refresh token is single-use, a second use would count as theft) |

### CSRF

A browser attaches cookies to any request to the site, whoever started it. Two layers:

1. `SameSite=Strict` (default) keeps the cookies off cross-site requests.
2. A **state-changing request authenticated by a cookie alone must carry `X-Requested-With`**, which a cross-site form
   cannot add (cross-origin XHR needs a CORS preflight, which only our own origin passes). Enforced in
   `ApiAuthenticationFilter` (POST/DELETE...), `/auth/refresh` and `/auth/logout`. The Angular interceptor adds the
   header to every credentialed call. A request that sends a Bearer header is not affected (there is no ambient
   credential to abuse).

## Configuration (auth-service)

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_COOKIE_SECURE` | `true` when `NODE_ENV=production`, else `false` | `Secure` attribute. Keep `true` behind HTTPS. The docker-compose file defaults it to `false` because a plain-http compose setup cannot use Secure cookies (browsers only exempt `http://localhost`) |
| `AUTH_COOKIE_SAMESITE` | `strict` | `strict`, `lax`, or `none`. `none` is for a front end on a different *site* than the API and forces `Secure` |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | `604800` | also the refresh cookie's lifetime |

Local development works as-is: `localhost:4200` (app), `localhost:3000` (auth) and `localhost:8081` (via the dev proxy)
count as the **same site** (cookies are not port-scoped), the auth service already allows credentials from
`http://localhost:4200`, and CORS now also allows the `X-Requested-With` header.

## Compatibility and what did not change

- The response bodies of login and refresh are unchanged, and `Authorization: Bearer` still works everywhere, so
  Postman/Bruno collections, Swagger and any non-browser client keep working. A browser **ignores** the tokens in the
  body (they are never stored).
- `RefreshRequest.refreshToken` is now optional in `contracts/auth-api.yaml`; `POST /auth/logout` is new
  (regenerate the clients: `npm run api:generate`).
- Old sessions: a session saved by the previous version (tokens in `localStorage`) is discarded on first load and the
  tokens erased from storage, so everyone signs in once more after deploying.

## Known limits

- **XSS can still act as the user** while the page is open (it can call the API); HttpOnly prevents token *theft*, not
  misuse. It does not replace a Content-Security-Policy and output encoding.
- **Access tokens are not revocable**: after logout the JWT stays valid until it expires (at most 15 minutes). That is
  the cost of stateless verification; the refresh token, the part that lasts, *is* revoked.
- The tokens are still returned in the JSON body for API clients. If no non-browser client needs them, the body could
  be reduced to `{ tokenType, expiresIn }` in a later contract change.
- `/api/v1/market` is now served by the order-service (it relays from the executor), so it goes through the same authentication as every other `/api/v1/` route. The executor's own endpoints still have no authentication, which is safe only because it is not reachable from outside the cluster or compose network.
- Behind a real gateway on one origin, nothing needs to change. If the SPA and the API end up on different *sites*,
  set `AUTH_COOKIE_SAMESITE=none` (with HTTPS) and list the SPA origin in the CORS allow-list.

## Trying it by hand

```bash
# login: note the two Set-Cookie lines
curl -i -c jar.txt -H "Content-Type: application/json" \
  -d '{"username":"alice.trader1","password":"<password>"}' http://localhost:3000/auth/login

# the profile, authenticated by the cookie alone
curl -b jar.txt http://localhost:3000/auth/me

# refresh with no body: the cookie is the credential, the header is the CSRF guard
curl -i -b jar.txt -c jar.txt -X POST -H "X-Requested-With: XMLHttpRequest" http://localhost:3000/auth/refresh

# logout: both cookies are expired
curl -i -b jar.txt -c jar.txt -X POST -H "X-Requested-With: XMLHttpRequest" http://localhost:3000/auth/logout
```
