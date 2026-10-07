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
│   ├── docker-compose.yml     Postgres, Kafka, auth DB (and containerised services)
│   └── .env.example           Settings shared by the services and compose
├── db/migrations/             create_schema.sql, sample_data.sql, incremental migrations
├── contracts/                 OpenAPI contracts (auth-api.yaml, trade-api.yaml) + change log
├── infra/kafka/               create-topics.sh (the three topics)
├── etl/                       Python ETL into an analytics store
├── documentation/             Guides, ER diagrams, API (Bruno) collections
└── run-app.ps1                Windows helper that opens each service in its own terminal
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
| Keys | [Fauxnance](#env-files) API key, [ExchangeRate-API](https://www.exchangerate-api.com) key | quotes and currency conversion |

Maven is not needed: each Java service ships `mvnw`. Make sure `java -version` prints 21 (set `JAVA_HOME` if not).

### Ports

| App | Port |
|---|---|
| Frontend | 4200 |
| auth-service | 3000 |
| order-service | 8081 |
| executor-service | 8082 |
| Postgres `trading_db` and `auth_db` | 5432 |
| Kafka | 9092 |

### Env files

| Service | Template | Copy to |
|---|---|---|
| Docker (Postgres, Kafka) and shared values | [`services/.env.example`](services/.env.example) | `services/.env` |
| auth-service | [`services/auth-service/.env.example`](services/auth-service/.env.example) | `services/auth-service/.env` |
| frontend e2e tests (optional) | [`frontend/.env.e2e.example`](frontend/.env.e2e.example) | `frontend/.env.e2e` |

```bash
cp services/.env.example services/.env
cp services/auth-service/.env.example services/auth-service/.env
```

Fill in `services/.env` (the values below are a working local set; use your own passwords and keys):

```env
POSTGRES_DB=trading_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DB_PASSWORD=postgres
JWT_SECRET=<a long random string>
JWT_ISSUER=auth-service
KAFKA_EXTERNAL_HOST=localhost
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
FAUXNANCE_BASE_URL=https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1
FAUXNANCE_API_KEY=<your Fauxnance key>
EXCHANGE_RATE_API_URL=https://v6.exchangerate-api.com/v6
EXCHANGE_RATE_API_KEY=<your ExchangeRate-API key>
```

`services/auth-service/.env` (`NODE_ENV=development` lets TypeORM create the auth tables for you; `JWT_SECRET` must equal the one above):

```env
NODE_ENV=development
PORT=3000
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5433
DATABASE_NAME=auth_db
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
JWT_SECRET=<same as services/.env>
JWT_ISSUER=auth-service
```

The two Spring services read the same names as **environment variables**. Set them in the terminal where you start each service (order-service also reads a `.env` in its own folder):

| Variable | order-service | executor-service |
|---|:-:|:-:|
| `DB_PASSWORD` | yes | yes |
| `JWT_SECRET`, `JWT_ISSUER` | yes | yes (signs the one-minute token a strategy's order is placed with) |
| `ORDER_SERVICE_BASE_URL` (default `http://localhost:8081`) | | yes (where strategies place their orders) |
| `STRATEGY_EXECUTION_ENABLED` (optional, default `true`; `false` is the kill switch) | | yes |
| `GEMINI_API_KEY` (optional; without it explanations are the platform's own wording) | yes | |
| `GEMINI_MODEL`, `GEMINI_RATE_LIMIT_RPM`, `CANDLE_CACHE_TTL_MINUTES`, `SIGNAL_CACHE_TTL_MINUTES` (optional) | yes | |
| `KAFKA_BOOTSTRAP_SERVERS` | yes | yes |
| `FAUXNANCE_BASE_URL`, `FAUXNANCE_API_KEY` | yes (portfolio, trade signals) | yes |
| `EXCHANGE_RATE_API_URL`, `EXCHANGE_RATE_API_KEY` | yes | yes |
| `POLL_INTERVAL_SECONDS` (optional, default 60) | | yes |

```bash
# bash / Git Bash
export DB_PASSWORD=postgres JWT_SECRET=<secret> JWT_ISSUER=auth-service KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export FAUXNANCE_BASE_URL=<url> FAUXNANCE_API_KEY=<key> EXCHANGE_RATE_API_URL=https://v6.exchangerate-api.com/v6 EXCHANGE_RATE_API_KEY=<key>
```

```powershell
# PowerShell
$env:DB_PASSWORD="postgres"; $env:JWT_SECRET="<secret>"; $env:JWT_ISSUER="auth-service"; $env:KAFKA_BOOTSTRAP_SERVERS="localhost:9092"
$env:FAUXNANCE_BASE_URL="<url>"; $env:FAUXNANCE_API_KEY="<key>"; $env:EXCHANGE_RATE_API_URL="https://v6.exchangerate-api.com/v6"; $env:EXCHANGE_RATE_API_KEY="<key>"
```

### Step 1: Databases

Two databases are needed: `trading_db` (order and executor services) and `auth_db` (auth-service). The Compose file starts both Postgres containers from `services/.env`.

```bash
cd services
docker compose --env-file .env up -d postgres auth-db
```

Create the `trading_db` tables and sample data (run once, from `services/`):

```bash
docker compose exec -T postgres psql -U postgres -d trading_db < ../db/migrations/create_schema.sql
docker compose exec -T postgres psql -U postgres -d trading_db < ../db/migrations/sample_data.sql
```

- `auth_db` is created by Compose and its tables (`users`, `refresh_tokens`) are created by auth-service on first start. Alternatively run [`services/auth-service/auth_setup.sql`](services/auth-service/auth_setup.sql).
- Using a local Postgres instead of Docker? Create both databases and point `DATABASE_PORT` / the datasource at your port (the Spring services use `localhost:5432/trading_db`).

### Step 2: Kafka

Kafka runs in Docker. `kafka-init` creates the topics `orders`, `trade-events` and `market-data` ([`infra/kafka/create-topics.sh`](infra/kafka/create-topics.sh)) and exits; that is normal. The only setting that matters is `KAFKA_EXTERNAL_HOST` in `services/.env`: the address clients on your machine use (`localhost`; use the VM's IP if Docker runs on another machine, and set `KAFKA_BOOTSTRAP_SERVERS` to `<that ip>:9092`).

```bash
cd services
docker compose --env-file .env up -d kafka kafka-init
```

Check the topics:

```bash
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --list
```

### Step 3: auth-service (port 3000)

```bash
cd services/auth-service
npm ci
npm run build
npm run start:dev
```

Check: <http://localhost:3000/api-docs> (Swagger) and <http://localhost:3000/health>.

### Step 4: order-service (port 8081)

New terminal, with the environment variables above set:

```bash
cd services/order-service
./mvnw spring-boot:run
```

On Windows PowerShell use `.\mvnw.cmd spring-boot:run`. Check: <http://localhost:8081/actuator/health>.

### Step 5: executor-service (port 8082)

New terminal, with the environment variables above set:

```bash
cd services/executor-service
./mvnw spring-boot:run
```

It consumes `orders`, settles fills, and serves the market board at `/api/v1/market/quotes`.

### Step 6: frontend (port 4200)

```bash
cd frontend
npm install
npm start
```

Open <http://localhost:4200>. The dev server proxies `/api` to the order-service and `/api/v1/market` to the executor-service ([`frontend/proxy.conf.json`](frontend/proxy.conf.json)), so no CORS setup is needed. Register, sign in, open an account from the dashboard, and trade.

**Windows shortcut:** after Step 1 and with your environment variables set, `.\run-app.ps1 --windows` opens the frontend, auth-service, order-service and executor-service in separate terminals and starts Kafka.

**Company logos** are plain files named after the ticker, e.g. `frontend/public/assets/icons/AAPL.svg`. A missing file falls back to the symbol's initials.

**Stopping:** `Ctrl+C` in each terminal, then `docker compose stop` in `services/`.

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

These drive a real browser against the **running stack** (Steps 1 to 6 done). Fill in `frontend/.env.e2e` first (a user with an active account, a user with a suspended one, and a symbol; the order test buys one share each run).

```bash
cd frontend
cp .env.e2e.example .env.e2e
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
