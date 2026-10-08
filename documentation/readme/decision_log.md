# Decision log

One entry per significant choice. A choice is significant when reversing it later would cost more than an afternoon, when a reasonable engineer would
have chosen differently, or when somebody asked why during the sprint and the answer took more than a sentence.

Each entry is a position, written as the decision itself in the present tense, with the same shape: a header table, then Context, Options considered,
Decision and Consequences. Facts in Context, not preferences. At least two options, each with a case for and against. Name the thing that decided it,
and write down the cost that was accepted: an entry with no cost in it has not described a real choice.

To add one: copy the last entry's shape, take the next number, and put it at the end of this file. When a decision is replaced, leave it in place,
set its status to `superseded by NNNN`, and write the new entry.

| # | Decision | Status |
|---|---|---|
| 0001 | The session lives in HttpOnly cookies, not in browser storage | accepted |
| 0002 | Payloads to the auth-service are wrapped in a JWE envelope, whole body, off by default | accepted |
| 0003 | One `config/application.yml` holds every URL, port and secret | accepted |
| 0004 | Orders are asynchronous: store, publish, price and settle in another service | accepted |
| 0005 | A strategy places its order through the public order route with a one-strategy token | accepted |
| 0006 | The account currency is chosen once, when the account is opened | accepted |
| 0007 | Email has three modes, and a personal SMTP account is the real one for now | accepted |
| 0008 | The AI assistant is optional and answers only about the signal | accepted |
| 0009 | Two-step sign-in is on by default and each user may switch it off | accepted |
| 0010 | The services share one HS256 secret instead of using public-key tokens | accepted |

---

# 0001 The session lives in HttpOnly cookies, not in browser storage

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-05 |
| Decided by | Team 3 |

## Context

The first version kept both tokens in `localStorage` and sent them as `Authorization: Bearer`. Any script that ran on the page could read them. The
Angular app and the three services run on different ports in development, so cookies have to cross an origin (`localhost:4200` to `localhost:3000`)
and the order-service has to accept the cookie as well as the header. The security review of 2026-10-05 records the move from storage to cookies.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep tokens in `localStorage` | Nothing to change, no CSRF to think about | An XSS bug or a bad dependency can copy both tokens and use them from anywhere |
| HttpOnly cookies, `SameSite=Strict`, with a CSRF header on changes | Scripts cannot read the tokens; the refresh cookie can be scoped to `/auth`; no secret in the page | A cookie authenticates ambiently, so CSRF has to be handled; refresh needs care across tabs; HTTP in clear text leaks cookies, so TLS becomes a requirement outside local development |
| Tokens in memory only | Not readable after the page closes | The session is lost on every reload; the page can still be asked for it by a script |

## Decision

Both tokens live in HttpOnly cookies set by the auth-service, and a cookie-authenticated change must carry `X-Requested-With`. What decided it: the
tokens are the one thing an XSS bug must not be able to take, and the cost of the cookie (CSRF) is a known, small, testable control.

## Consequences

The page stores only the username and the expiry time. Refresh is single-flight in a tab and serialised across tabs with a Web Lock, because a refresh
token works once. The refresh cookie's `Path=/auth` keeps it away from the trading APIs. `Secure` is on only in production, so any deployment beyond
`localhost` must serve HTTPS and set `auth.cookie.secure`. HttpOnly does not stop an XSS bug acting as the user while the page is open, so a CSP and
security headers remain outstanding ([SECURITY_REVIEW_APP.md](SECURITY_REVIEW_APP.md)).

---

# 0002 Payloads to the auth-service are wrapped in a JWE envelope, whole body, off by default

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | Team 3 |

## Context

The request was to encrypt payloads between the frontend and the services. HTTPS already protects the transport; what an envelope adds is protection
where TLS ends (a gateway, a proxy, a request dump or an access log). The code that encrypts is delivered by the same origin as the page, so it cannot
protect against a tampered page. The auth-service carries the most sensitive bodies (passwords, one-time codes). Spring and Node both support the
standard JOSE algorithms, so one scheme can serve every service later.

## Options considered

| Option | For | Against |
|---|---|---|
| Rely on HTTPS only | No work, no new failure modes | Plaintext is visible at every hop that terminates TLS and in anything that logs bodies |
| Encrypt chosen fields | The JSON shape stays, so proxies can still route and validate on the rest | Easy to forget a field; a decorator or list per DTO on every service |
| Wrap the whole body in a JWE | Nothing to forget; no controller or DTO changes; one interceptor and one middleware | Bodies are unreadable in dev tools without a switch; slightly more CPU; URLs and headers are not covered |
| Invent a scheme | None | Hand-rolled crypto is the thing to avoid |

## Decision

Wrap the whole body in a standard JWE (RSA-OAEP-256 and A256GCM in, ECDH-ES and A256GCM out), bound to the method, path, time and a one-time id, and
start with the auth-service only, behind `encryption.mode` (`off`, `optional`, `required`). The thing that decided it: a forgotten field is the
failure that field-level encryption produces, and the whole-body envelope removes it without touching any business code.

## Consequences

The browser fetches the service's key and encrypts when one is published, so turning it off needs no frontend change. `optional` keeps Bruno and curl
working; `required` would need a pre-request script for them. The private key lives in `config/application.yml`, never in git. Phase 2 (order-service,
Nimbus JOSE), a shared Node and Java test vector, key pinning and rotation on login are not done, so the order and executor services still send plain
JSON behind the cookie. It must never be used as a reason to relax TLS, cookies or authorisation.

---

# 0003 One `config/application.yml` holds every URL, port and secret

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | Team 3 |

## Context

Settings were spread over a root `.env`, `services/.env`, `services/auth-service/.env`, environment variables set by hand in terminals, hard-coded
properties (`localhost:5432`, `8081`, Kafka addresses), the frontend's `api.config.ts` and `proxy.conf.json`, and the contracts' `servers:`. A value
changed in one place and not another was the commonest cause of a service that would not start, and a database password was written into scripts and
guides.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep `.env` files per service | Familiar, each service self-contained | The same value in three places; templates drift; nothing says which file a service reads |
| Environment variables only | Standard for containers | Typed by hand in every terminal; no place to see the whole picture |
| One YAML file, read by every part | One place; comments next to each key; same shape for every reader | Every reader needs a loader; a real secret sits in one file on disk |

## Decision

One git-ignored `config/application.yml`, with a committed `application.example.yml` as the template and as the fallback when the real file is
missing. The Spring services import it as properties, the auth-service maps it to the environment it already reads, and a small CLI generates what the
frontend, the contracts and docker compose need. A real environment variable still wins, so a container can override one value. What decided it: a
single file is the only arrangement in which "where is this set?" has one answer.

## Consequences

`.env` files are gone and no code carries a URL or a secret. A new setting goes into the example file first. The frontend needs a generation step
(`npm start`, `build`, `test` and `e2e` run it). The real file is plain text on disk, so it must stay out of git and be protected like any secret file;
production should inject the same keys from a secret store rather than ship the file.

---

# 0004 Orders are asynchronous: store, publish, price and settle in another service

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 (recorded now; the design is older) |
| Decided by | Team 3 |

## Context

Pricing needs a live quote from an outside API, and settlement changes cash and holdings in one transaction. The order-service answers the customer; the
executor owns pricing and settlement and also serves the market board. Both write to `trading_db`.

## Options considered

| Option | For | Against |
|---|---|---|
| Price and settle inside the order request | Simple, the answer is final | A slow or failing quote API blocks the customer; pricing and the market board would live in one service |
| Store a `NEW` order and publish it to Kafka; the executor settles and publishes the result | The customer is not held up; the executor can retry or reject without the order-service knowing how; other features (notifications, portfolio) subscribe to the result | An order is not final when the call returns; there are two services and a broker to run; delivery is at least once |

## Decision

Store, publish after commit, settle in the executor, publish the result. What decided it: the other extensions (notifications, P&L, strategies) all
need the same events, and publishing them once is cheaper than every feature polling.

## Consequences

The UI polls an order until it is `FILLED` or `REJECTED`. Publishing happens after the database commit, so no event describes a rollback. Consumers
must tolerate duplicates. Anyone who can write to the `orders` topic can place an order, so Kafka access is part of the security boundary
([SECURITY_REVIEW_APP.md](SECURITY_REVIEW_APP.md)).

---

# 0005 A strategy places its order through the public order route with a one-strategy token

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 (recorded now; the design is older) |
| Decided by | Team 3 |

## Context

A strategy has to place an order when no one is signed in. The platform already has one place that validates, checks the account and writes an order:
`POST /api/v1/orders`.

## Options considered

| Option | For | Against |
|---|---|---|
| The executor writes the order row or publishes to `orders` itself | No HTTP hop | A second path that skips validation and ownership checks; a bug there is a way around every rule |
| The executor calls the order route as the customer would, with a short-lived token for one strategy | Every rule still applies; the token can be refused everywhere except order placement | The executor holds the signing secret; a token has to be minted per order |

## Decision

The executor mints a 60-second HS256 token carrying the strategy id and calls `POST /api/v1/orders`; the order-service's filter accepts that token on
that route only. A test fails the build on any reference to order placement or the `orders` topic from the strategy code. The thing that decided it: a
strategy that cannot reach any other path cannot bypass the rules of the main one.

## Consequences

A stolen token can try one order for under a minute and read nothing. The shared secret must be protected in the executor too. The strategy's limits
are derived and checked against the account again at placement.

---

# 0006 The account currency is chosen once, when the account is opened

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 (recorded now; the change was made in Sprint 10) |
| Decided by | Team 3 |

## Context

Settings once let a customer convert the whole account to another currency. That rewrote balances, order prices and holdings, needed a live rate at
that moment, refused while orders were open, and left no way to tell what the numbers had been.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep conversion in Settings | Flexible | Rewrites history; depends on a rate at one instant; the largest source of edge cases in the preferences code |
| Choose at account opening and fix it | Nothing is ever rewritten; no rate is needed to open an account | A customer who chose wrongly needs a new account |

## Decision

The currency is a field of account creation (default USD) with a per-currency minimum opening balance, and Settings shows it read-only; a request that
names a different currency is refused (`CUR-409`). What decided it: every stored amount keeps one meaning for the life of the account.

## Consequences

The conversion code (balances, order prices, holdings) is removed. Instruments quoted in another currency are still converted for each order. Existing
clients that send the current currency, or none, are unaffected.

---

# 0007 Email has three modes, and a personal SMTP account is the real one for now

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | Team 3 |

## Context

Registration, two-step sign-in and notifications send email. MailHog is a developer tool and could not be the production path; a provider
(SES, SendGrid, Postmark) needs a verified domain with SPF, DKIM and DMARC records, which the team has not set up. A personal Gmail account with an
app password is valid and sends to real addresses, up to about 500 recipients a day.

## Options considered

| Option | For | Against |
|---|---|---|
| MailHog only | Nothing leaves the machine | No real delivery |
| A transactional provider with a team domain | The right long-term answer | Needs DNS and an account decision that is not made |
| A personal Gmail account now, the provider later | Real delivery today; only configuration changes later | Gmail rewrites the From address and caps volume; the app password is a personal credential |

## Decision

Three modes in both services: `off` (the default), `dev` (MailHog) and `prod` (a real SMTP account over TLS, with a login, a verified sending domain, a
per-minute cap and a recipient allow-list). The real account is the Gmail one for now. What decided it: the modes are the same whichever account sits
behind `prod`, so the later move to a provider changes values and no code.

## Consequences

Each service refuses to start when its mode and settings disagree, and says which key to fix. The app password lives in `config/application.yml` and
must not be committed. Outside `environment: production`, real mail needs `allowed-recipient-domains` (`*` says anyone, on purpose). The provider and
DNS records remain a decision for the team ([EMAIL.md](EMAIL.md)).

---

# 0008 The AI assistant is optional and answers only about the signal

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | Team 3 |

## Context

A language model can explain a signal in words, but it can also be talked into other work, and it costs quota. The platform must work with no key, and a
customer's identity and balances have no business reaching a third party.

## Options considered

| Option | For | Against |
|---|---|---|
| No assistant | No risk | Less useful explanations |
| An assistant with a prompt asking it to behave | Easy | A prompt alone is the weakest control: a clever message can override it |
| Optional assistant with fixed rules, a pre-model filter, a marker for off-topic and platform wording as the fallback | The model is never required; take-over attempts never reach it; what the customer sees for off-topic is ours | Some phrasings will slip past the filter; a filter can reject an odd but honest question |

## Decision

The assistant is off unless a key is set and the customer turns it on. Only the signal's numbers and the units held are sent. Messages that look like
a take-over are answered with fixed wording without a model call; the model is told to answer anything else off-topic with `OFF_TOPIC`, which the
service replaces with the same fixed wording. Rates are limited per platform and per account. What decided it: the words the customer sees for a
refusal must not depend on the model's cooperation.

## Consequences

Without a key every explanation is the platform's own wording and the chat says so. The startup log states whether a key is configured, never the key.
An invalid key shows as "could not reach the assistant" with the HTTP status in the log.

---

# 0009 Two-step sign-in is on by default and each user may switch it off

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | Team 3 |

## Context

Two-step sign-in was a per-user preference, off until switched on. With real email now available, the safer default is on. A code cannot be sent when
email is off, and a sign-in that waits for a code that never comes locks the customer out.

## Options considered

| Option | For | Against |
|---|---|---|
| Off by default | No friction | Most accounts never get the protection |
| On by default, user may switch off | Protection by default; the choice stays the customer's | One more step at every sign-in; depends on email delivery |
| On, and not switchable | Strongest | Locks users out whenever email fails |

## Decision

New users have it on (`users.two_factor_enabled` defaults to true; existing rows keep their value) and Settings can switch it off; the choice is saved
with the other settings, not the moment it is picked. While email is off, sign-in skips the code step and logs it. What decided it: a lock-out is worse
than a skipped step, and it is logged.

## Consequences

Accounts created before this change are unchanged; a one-line `UPDATE` would turn them on. Switching it on is refused when no code could be emailed.

---

# 0010 The services share one HS256 secret instead of using public-key tokens

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-05 |
| Decided by | Team 3 |

## Context

The auth-service issues the access token; the order-service and the executor-service verify it (and the executor mints its own short token for
strategies). The first implementation signed with a symmetric secret shared through configuration.

## Options considered

| Option | For | Against |
|---|---|---|
| HS256 with one shared secret | Simple; one setting; no key distribution | Anyone holding the secret can mint tokens, and every verifier holds it |
| RS256 or ES256, private key in the auth-service, public key everywhere else | Verifiers cannot mint; a leaked verifier leaks nothing | A key pair to manage and rotate; the executor still needs its own signing path for strategy tokens |

## Decision

Keep HS256 with one secret (`jwt.secret`, at least 32 characters, checked at start-up). What decided it: the project is one team and one deployment, and
the executor's strategy token needs a signing key anyway. The cost is accepted knowingly.

## Consequences

Whoever can read `application.yml` can mint any token, so the file's protection is part of the security model. Moving to asymmetric keys later changes
the auth-service, the two verifiers and the executor's minter, and is the first thing to do before a shared or public deployment.
