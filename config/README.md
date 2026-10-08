# Configuration

Every URL, port, credential and switch of the platform lives in **one file**: `config/application.yml`.

| File | In git | Purpose |
|---|---|---|
| `application.example.yml` | yes | The template: every key, no secrets, sensible local defaults. Also the fallback when `application.yml` is missing, so a fresh clone builds and its tests run. |
| `application.yml` | **no** (git-ignored) | Your copy with the real passwords, API keys, the email account and the encryption key. `cp config/application.example.yml config/application.yml` |

Nothing else holds a setting. There are no `.env` files any more (the old ones are no longer read; delete them).

## Who reads it, and how

| Reader | How |
|---|---|
| **auth-service** | `src/config/central-config.ts` reads the file at start-up and fills the environment variables the service already uses (the table `KEY_TO_ENV` in that file lists every one). A real environment variable still wins, so a container can override a single value. |
| **order-service, executor-service** | `spring.config.import` in `application.properties` loads the example and then `application.yml` as properties. `application*.properties` refer to keys as `${database.trading.password}`. Override a key with an environment variable named like it (`DATABASE_TRADING_PASSWORD`) or a JVM option. |
| **frontend** | `node config/cli.js frontend` (run by `npm start`, `build`, `test` and `e2e`) generates `src/app/config/platform.config.ts` (the service URLs the typed clients use), `proxy.conf.json` (the dev proxy) and the e2e settings. The generated files are git-ignored. |
| **contracts** | `node config/cli.js contracts` (run before `npm run api:generate`) writes the `servers:` URL of each OpenAPI contract from `services.auth` / `services.order`. |
| **docker compose** | `node config/cli.js compose-env` writes `services/.env` (ports, database login, Kafka) for the `${VARIABLES}`; the auth and order containers mount `application.yml` itself. |
| **run-app.ps1, scripts.sh, the ETL, the e2e scripts** | `node config/cli.js get <key>` / `env`, or the same loader in Python (`etl/src/config.py`). |

## Commands

```bash
node config/cli.js check             # what is missing or unsafe (run-app.ps1 does this first)
node config/cli.js get services.order.url
node config/cli.js frontend          # regenerate the frontend files
node config/cli.js contracts         # rewrite the contracts' servers:
node config/cli.js compose-env       # write services/.env for docker compose
node config/cli.js enc-key           # a new payload-encryption key to paste under `encryption:`
```

The first time: `cd config && npm install` (one dependency, `js-yaml`; `run-app.ps1` does it for you).

## The keys

| Section | What |
|---|---|
| `environment` | NODE_ENV of the auth-service: `local`, `development` or `production` |
| `services.*` | `host` and `port` of the frontend, auth, order and executor services, and MailHog (SMTP and web port) |
| `database.trading`, `database.auth` | host, port, name, user, password of the two PostgreSQL databases |
| `docker` | the repository the order-service image is built from (compose only) |
| `kafka` | `bootstrap-servers` for the services; `external-host` and `external-port` that compose advertises |
| `jwt` | the shared signing `secret`, `issuer`, token lifetimes |
| `external.fauxnance`, `external.exchange-rate`, `external.gemini` | third-party URLs and API keys, the Gemini model and rate limit |
| `signals` | cache lifetimes for candles and signals |
| `auth.*` | log level, email verification and two-step switches, one-time code settings, cookies, extra CORS origins, and `auth.email.*` |
| `encryption` | payload encryption: `mode` (`off`, `optional`, `required`), `kid`, `private-key-pem`, clock tolerance |
| `order.email` | notification email: `mode` (`off`, `dev`, `prod`), SMTP account, sender, allow-list, send cap |
| `executor` | polling interval, watched symbols, strategy execution switch |
| `e2e` | the accounts and symbol the Playwright journeys use |

Email modes and the Gmail app-password setup are in [`documentation/readme/EMAIL.md`](../documentation/readme/EMAIL.md).

## Rules

- A new setting goes into `application.example.yml` first (with a comment), then into the service that reads it. No URL, port or secret in code.
- Never put a real secret in `application.example.yml`.
- Tests keep their own fixtures (`src/test/resources`, spec files); they do not read `application.yml`.
