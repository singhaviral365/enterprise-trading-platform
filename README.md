# Enterprise Trading Platform

Developed by:

- [Yuvaraj K](https://github.com/yuvarajk2109)
- [Aviral Singh](https://github.com/singhaviral365)
- [Riya Rajesh](https://github.com/RiyaR04)
- [Lalitha Prakash](https://github.com/LalithaPrakash)

## Table of Contents

1. [App Overview](#1-app-overview)
2. [Project Structure](#2-project-structure)
3. [Running the Application Locally](#3-running-the-application-locally)
4. [Tests and Coverage Reports](#4-tests-and-coverage-reports)

---

## 1. App Overview

A web trading platform: sign up, open an account, watch live prices, place buy and sell orders, and follow what you hold.

| Area | What it does |
|---|---|
| **Dashboard** | Cash, invested amount, open orders, a donut chart of your investments, recent orders |
| **Market data** | Live quotes with company logos; click a row for the quote and the order ticket |
| **Positions** | Cards (default) or table; click one to see the buys behind it, then buy more or sell |
| **Order history** | Every order with status, filters, sorting and cancellation of working orders |
| **Strategies** | Rules such as "buy 50 AAPL if it falls to 150" that the platform trades for you, inside limits you set ([how it works](documentation/readme/STRATEGIES.md)) |
| **Trade signals** | A BUY / SELL / HOLD reading with its numbers on every quote, and an optional AI assistant to ask about it ([how it works](documentation/readme/SIGNALS.md)) |
| **Currencies** | Instruments quoted in another currency (e.g. INFY.NS in INR) are converted to your account currency using ExchangeRate-API |
| **Sessions** | JWTs live in HttpOnly cookies; nothing secret is kept in browser storage |

How the pieces talk to each other:

```
Angular app (4200) ──► auth-service (3000)        sign-in, sessions        ──► auth_db
        │
        ├──────────► order-service (8081)         accounts, orders         ──► trading_db
        │                  │ publishes `orders`
        │                  ▼
        │               Kafka (9092) ──► executor-service (8082)  fills orders, settles ──► trading_db
        │                                     │ publishes `trade-events`, `market-data`
        └──────────► executor-service (8082)    live market board (Fauxnance quotes, FX rates)
```

Orders are asynchronous: the order-service stores a `NEW` order and publishes it; the executor prices it against a live quote, settles cash and holdings, and the order becomes `FILLED` or `REJECTED`.

More detail lives in [`documentation/readme`](documentation/readme): [design system](documentation/readme/DESIGN_SYSTEM.md), [currency](documentation/readme/CURRENCY.md), [auth cookies](documentation/readme/AUTH-COOKIES.md), [Kafka flow](documentation/readme/KAFKA-FLOW.md), [automated strategies](documentation/readme/STRATEGIES.md), [trade signals](documentation/readme/SIGNALS.md), [portfolio history plan](documentation/readme/PORTFOLIO-HISTORY-PLAN.md).

---

## 2. Project Structure

```
enterprise-trading-platform/
├── frontend/                  Angular 22 app (Vitest unit tests, Playwright e2e)
│   ├── src/app/api/generated  Typed API clients generated from /contracts (do not edit)
│   ├── src/app/shared/ui      Reusable components (pagination, dropdown, dialogs, charts...)
│   └── public/assets/icons    Company logos, <TICKER>.svg in upper case
├── services/
│   ├── auth-service/          NestJS: register, login, refresh, logout (port 3000)
│   ├── order-service/         Spring Boot: accounts and orders REST API (port 8081)
│   ├── executor-service/      Spring Boot: Kafka order executor, market board (port 8082)
│   ├── reports/               Committed test and coverage reports
│   └── docker-compose.yml     Postgres, Kafka, auth DB (and containerised services)
├── db/migrations/             create_schema.sql, sample_data.sql, incremental migrations
├── config/                    application.yml: the one place for every URL, port and secret (see config/README.md)
├── contracts/                 OpenAPI contracts (auth-api.yaml, trade-api.yaml) + change log
├── infra/kafka/               create-topics.sh (the three topics)
├── etl/                       Python ETL into an analytics store
├── documentation/             Guides, ER diagrams, API (Bruno) collections
└── run-app.ps1                One command: opens each service in its own terminal, with encryption and real email
```

---

## 3. Running the Application Locally

### Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 LTS or newer (20.19+ works) | frontend, auth-service |
| npm | 10+ | installs |
| JDK | **21** | order-service, executor-service |
| Docker + Compose | recent | Postgres and Kafka |
| PostgreSQL | 16 (via Docker below, or a local install) | databases |
| Keys | [Fauxnance](#configuration-one-file) API key, [ExchangeRate-API](https://www.exchangerate-api.com) key | quotes and currency conversion |

Maven is not needed: each Java service ships `mvnw`. Make sure `java -version` prints 21 (set `JAVA_HOME` if not).

### Ports

All of them are set in `services:` and `database:` of `config/application.yml`; these are the defaults.

| App | Port |
|---|---|
| Frontend | 4200 |
| auth-service | 3000 |
| order-service | 8081 |
| executor-service | 8082 |
| Postgres `trading_db` and `auth_db` | 5432 (the auth database may use another) |
| Kafka | 9092 |
| MailHog (dev email only) | SMTP 1025, web 8025 |

### Configuration: one file

Everything configurable lives in **[`config/application.yml`](config/README.md)**: ports and URLs, both database logins, Kafka, the JWT secret, the Fauxnance, ExchangeRate-API and Gemini keys, the email account, the encryption key and the e2e accounts. It is git-ignored; [`config/application.example.yml`](config/application.example.yml) is the committed template. The services, the frontend, the OpenAPI contracts, docker compose and the scripts all read it and nothing else ([how, in `config/README.md`](config/README.md)). There are no `.env` files.

```bash
cp config/application.example.yml config/application.yml
node config/cli.js enc-key        # prints kid and private-key-pem for the `encryption:` block (needs `cd config && npm install` once)
```

Open `config/application.yml` and fill in at least:

| Key | Value |
|---|---|
| `database.trading.password`, `database.auth.password` | your Postgres password (and `database.auth.port` if the auth database is on another port) |
| `jwt.secret` | a long random string (32+ characters) |
| `kafka.bootstrap-servers` | where Kafka is, for example `localhost:9092` |
| `external.fauxnance.*`, `external.exchange-rate.api-key` | the programme's market data URL and key, your ExchangeRate-API key |
| `external.gemini.api-key` | optional; without it the assistant says it is not set up |
| `auth.email.*` and `order.email.*` | the SMTP account for real email, see [email](documentation/readme/EMAIL.md) (a Gmail address with an app password works) |
| `encryption.kid`, `encryption.private-key-pem` | from `node config/cli.js enc-key` |

`node config/cli.js check` tells you what is still missing.

### Step 1: Databases

Two databases are needed: `trading_db` (order and executor services) and `auth_db` (auth-service). With Docker, Compose starts both Postgres containers from the same file (the script writes the `services/.env` it needs):

```bash
node config/cli.js compose-env
cd services
docker compose --env-file .env up -d postgres auth-db
```

Create the `trading_db` tables and sample data (run once, from `services/`):

```bash
docker compose exec -T postgres psql -U postgres -d trading_db < ../db/migrations/create_schema.sql
docker compose exec -T postgres psql -U postgres -d trading_db < ../db/migrations/sample_data.sql
```

- `auth_db`'s tables (`users`, `refresh_tokens`) are created by auth-service on first start. Alternatively run [`services/auth-service/auth_setup.sql`](services/auth-service/auth_setup.sql).
- Using a local Postgres instead of Docker? Create both databases and set `database.*.host/port` in `config/application.yml`.

### Step 2: Kafka (start it yourself)

Kafka normally runs in your Linux environment, and you start it there. Put its address in `kafka.bootstrap-servers`. Three topics are needed, `orders`, `trade-events` and `market-data` ([`infra/kafka/create-topics.sh`](infra/kafka/create-topics.sh)).

To run it in Docker on this machine instead: `.\run-app.ps1 --windows` does it for you, or by hand:

```bash
node config/cli.js compose-env
cd services
docker compose --env-file .env up -d kafka kafka-init
```

(`kafka-init` creates the topics and exits; that is normal.)

### Step 3: Run everything with one command

```powershell
.\run-app.ps1
```

This opens four terminals: the frontend (4200), auth-service (3000), order-service (8081) and executor-service (8082), **with payload encryption and real (prod) email enabled, exactly as `config/application.yml` says** (`encryption.mode`, `auth.email.mode`, `order.email.mode`). It checks the configuration first and tells you what is missing. Open <http://localhost:4200>, register, sign in, open an account from the dashboard, and trade.

| Command | What it does |
|---|---|
| `.\run-app.ps1` | the four services; encryption and real email as configured |
| `.\run-app.ps1 --windows` | the same, and starts Kafka with docker compose |
| `.\run-app.ps1 --dev-mail` | email goes to MailHog (run it yourself, SMTP and web ports in `services.mailhog`) instead of the real account |
| `.\run-app.ps1 --no-email` | no email at all (set `auth.verification-enabled: false` or registration cannot send its code) |
| `.\run-app.ps1 --no-encryption` | encryption off for this run |

Kafka and the databases must be running first (Steps 1 and 2).

### Running the services by hand

Each service reads `config/application.yml` itself; start them from their own folder, in any order after Kafka and the databases.

```bash
# auth-service: http://localhost:3000/api-docs, /health
cd services/auth-service && npm ci && npm run build && npm run start

# order-service: http://localhost:8081/actuator/health
# add -Dspring-boot.run.profiles=prod (or dev) to send email, matching order.email.mode
cd services/order-service && ./mvnw spring-boot:run

# executor-service: consumes `orders`, settles fills, serves the market board at /api/v1/market/quotes
cd services/executor-service && ./mvnw spring-boot:run

# frontend: npm start generates its config from application.yml, proxies /api to the order-service and /api/v1/market to the executor
cd frontend && npm install && npm start
```

On Windows PowerShell use `.\mvnw.cmd spring-boot:run`. The dev proxy means no CORS setup is needed.

**Company logos** are plain files named after the ticker, e.g. `frontend/public/assets/icons/AAPL.svg`. A missing file falls back to the symbol's initials.

**Stopping:** `Ctrl+C` in each terminal, then `docker compose stop` in `services/` if you started containers.

---

## 4. Tests and Coverage Reports

### Frontend (unit, Vitest)

```bash
cd frontend
npm test                  # watch mode
npx ng test --watch=false # one run
npm run test:ci           # one run with coverage (fails under the thresholds)
```

Reports (git-ignored): `frontend/test-reports/html/index.html` (view with `npm run test:report`) and `frontend/coverage/frontend/index.html` (`npm run coverage:report`).

### Frontend (end-to-end, Playwright)

These drive a real browser against the **running stack** (`run-app.ps1` running). Fill in the `e2e:` block of `config/application.yml` first (a user with an active account, a user with a suspended one, and a symbol; the order test buys one share each run).

```bash
cd frontend
npx playwright install chromium
npm run e2e
npm run e2e:report        # open the last HTML report
```

### auth-service (Jest)

```bash
cd services/auth-service
npm test                  # unit tests
npm run test:report       # tests + coverage + HTML report
```

Written straight into `services/reports`: HTML at `services/reports/jest/test-report.html`, JUnit XML at `services/reports/junit/junit.xml`, coverage under `services/auth-service/coverage`.

### order-service and executor-service (JUnit, Surefire, JaCoCo)

order-service integration tests use Testcontainers, so **Docker must be running**. Run from each service folder (`services/order-service` or `services/executor-service`):

```bash
./mvnw clean verify                  # runs tests, writes JaCoCo coverage
./mvnw surefire-report:report        # builds the Surefire HTML test report
```

| Output | Generated at |
|---|---|
| Test report (HTML + assets) | `target/reports/surefire.html` (with `css`, `js`, `img`... beside it) |
| Test results (XML) | `target/surefire-reports/` |
| Coverage report (HTML) | `target/site/jacoco/index.html` |

#### Copy into `services/reports` and apply your styling

Run from the **repository root**. The Surefire folder keeps your `surefire.css` and `inject.*` scripts, so copy the contents in (`/.`) instead of replacing the folder. Use `backend` for order-service and `executor` for executor-service.

order-service:

```bash
cp -r services/order-service/target/reports/. services/reports/surefire/backend-tests-report/
cp -r services/order-service/target/surefire-reports/. services/reports/surefire/surefire-reports/
rm -rf services/reports/jacoco/backend-test-coverage/jacoco
mkdir -p services/reports/jacoco/backend-test-coverage
cp -r services/order-service/target/site/jacoco services/reports/jacoco/backend-test-coverage/
```

executor-service:

```bash
cp -r services/executor-service/target/reports/. services/reports/surefire/executor-tests-report/
cp -r services/executor-service/target/surefire-reports/. services/reports/surefire/surefire-reports/
rm -rf services/reports/jacoco/executor-test-coverage
mkdir -p services/reports/jacoco/executor-test-coverage
cp -r services/executor-service/target/site/jacoco/. services/reports/jacoco/executor-test-coverage/
```

If `surefire.css` is missing from `executor-tests-report/`, copy it from `backend-tests-report/` first.

Then inject the custom styling (adds `surefire.css`, the Quicksand font and, for order-service, the note explaining the skipped `BackendApplicationTests`). It is safe to run more than once. Run it from inside the report folder:

```bash
# Linux / macOS / Git Bash
cd services/reports/surefire/backend-tests-report && bash inject.sh        # order-service
cd services/reports/surefire/executor-tests-report && bash inject.sh       # executor-service
```

```bat
:: Windows (cmd)
cd services\reports\surefire\backend-tests-report && inject.cmd
cd services\reports\surefire\executor-tests-report && inject.cmd
```

Open `services/reports/surefire/<backend|executor>-tests-report/surefire.html` and `services/reports/jacoco/<backend-test-coverage/jacoco|executor-test-coverage>/index.html` in a browser.
