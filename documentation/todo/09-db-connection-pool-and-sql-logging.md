# 09 · Database connection pool (Hikari) and SQL log noise in order-service and executor-service

Status: **plan**. Findings first, then what to change.

## 1. What the log you pasted actually is

```
SqlSession [...] was not registered for synchronization because synchronization is not active
JDBC Connection [HikariProxyConnection@... wrapping PgConnection@...] will not be managed by Spring
Closing non transactional SqlSession [...]
```

- **It is not an error and not a pool problem.** It is MyBatis telling you, at DEBUG level, that a query ran **outside a Spring transaction**: it opened a `SqlSession`, borrowed a connection, ran the statement and handed the connection straight back ("Closing non transactional SqlSession").
- **Why you see it:** both services set
  `logging.level.org.mybatis=DEBUG` and `logging.level.org.springframework.jdbc=DEBUG` in `application.properties`
  (`order-service` lines 127-128, `executor-service` lines 79-80), for every profile. That prints several lines for every query, including the
  idle `EmailDispatcher.dispatchQueued` job, which opens a transaction every 5 seconds even when nothing is queued (the second half of your paste).
- The `HikariProxyConnection@...` is just the pool's wrapper around a real `PgConnection`. Different proxy numbers on the same `PgConnection` is the pool lending the same physical connection to different queries in turn; that is exactly what it is for.

## 2. Is Hikari configured? Do we need to?

**Not explicitly.** Neither service has any `spring.datasource.hikari.*` property (or any Java configuration of the pool). Spring Boot therefore uses
**HikariCP with its defaults**, which is a sensible default pool, but it means the pool settings are accidental rather than chosen:

| Setting | Boot/Hikari default (today) | Consequence |
|---|---|---|
| `maximumPoolSize` | 10 | One service can run at most 10 queries at once. Tomcat has up to 200 request threads, the strategy worker and the Kafka consumers are more |
| `minimumIdle` | same as max (10) | Holds 10 idle connections per service at all times (20 on the shared `trading_db`) for a dev-sized workload |
| `connectionTimeout` | 30 s | When the pool is exhausted a request **waits half a minute** before failing; users see a hang, not an error |
| `maxLifetime` | 30 min | Fine, but should be shorter than any proxy/firewall/DB idle timeout |
| `idleTimeout` | 10 min | Ignored while `minimumIdle == maximumPoolSize` |
| `leakDetectionThreshold` | off | A connection that is never returned is invisible |
| Pool name | `HikariPool-1` | Two services, hard to tell apart in logs and metrics |

So: **nothing is broken today**, and with the current load (a few users) the defaults are enough. But we **should** configure it, for three reasons:
1. The two services share one database (`trading_db`) and both default to 10, so the platform can open 20 connections without anyone deciding that.
2. A saturated pool fails slowly (30 s) by default; failing fast is kinder.
3. Some work is connection-hungry: the executor's strategy worker reads strategies "fresh on every quote, never cached" (STRATEGIES.md), the market poller, the Kafka consumers and the market API all share its one pool; the order-service has the portfolio, notifications, watchlist and strategy modules plus the email dispatcher.

(The auth-service has its own `auth_db` and its own TypeORM pool, default 10; out of scope here.)

## 3. Proposed configuration

Property names are Boot's; every value has an environment override so deployment can tune it without a rebuild.

`application.properties` (both services; only the names and the pool numbers differ):

```properties
# Connection pool (HikariCP). Sized for the shared trading_db: order-service + executor-service together stay well under Postgres's 100 connections.
spring.datasource.hikari.pool-name=order-service-pool            # executor-service-pool in the other one
spring.datasource.hikari.maximum-pool-size=${DB_POOL_MAX:10}     # order-service 10, executor-service 10 (see sizing below)
spring.datasource.hikari.minimum-idle=${DB_POOL_MIN_IDLE:2}
spring.datasource.hikari.connection-timeout=${DB_POOL_CONNECTION_TIMEOUT_MS:5000}   # fail in 5 s, not 30
spring.datasource.hikari.idle-timeout=300000        # 5 min
spring.datasource.hikari.max-lifetime=1500000       # 25 min (below the 30 min default and any proxy idle timeout)
spring.datasource.hikari.keepalive-time=300000      # 5 min ping on idle connections, so a firewall does not silently drop them
spring.datasource.hikari.validation-timeout=3000
```

`application-dev.properties` (order-service) and a new one for the executor: `spring.datasource.hikari.leak-detection-threshold=10000`
(logs a stack trace when a connection is held for more than 10 s; in dev only, because it has a small cost and a long import or a debugger
pause would trigger it in production).

### 3.1 Sizing (how I would pick the numbers, with the data to check them)

| | Start with | Reasoning | How to verify |
|---|---|---|---|
| order-service | 10 | Request/response workload plus background jobs; queries are short | `hikaricp.connections.active` and `.pending` stay low under a click-through of every page |
| executor-service | 10 | Kafka consumers (orders, quotes), the strategy worker (reads per quote), the market board API | Run with several active strategies and a busy `market-data` topic; `pending` must not stay above 0 |
| Total | 20 of Postgres's default `max_connections = 100` | Leaves room for tools (psql, the ETL, the auth DB is separate) | `SELECT count(*) FROM pg_stat_activity;` |

If `pending` stays above zero or `hikaricp.connections.timeout` increments, raise that service's `DB_POOL_MAX` (to 15 or 20) rather than the timeout.
A bigger pool is not automatically better: past a point it only moves the queue into Postgres.

### 3.2 Make the pool observable
Both services already include `spring-boot-starter-actuator`; the order-service exposes `health,metrics` under the `dev` profile only.
Hikari publishes Micrometer metrics automatically when the actuator is present: `hikaricp.connections`, `.active`, `.idle`, `.pending`,
`.timeout`, `.usage`, `.acquire`. Plan:
- Expose `health,metrics` for the executor under its `dev` profile too (same line as the order-service).
- Add a short "what to look at" table to the service READMEs (the metric names above).
- One-time check of the effective values: set `logging.level.com.zaxxer.hikari.HikariConfig=DEBUG` temporarily to print the final configuration at start-up, then remove it.

## 4. Clean up the logging

| Change | Why |
|---|---|
| Remove `logging.level.org.mybatis=DEBUG` and `logging.level.org.springframework.jdbc=DEBUG` from the shared `application.properties` of **both** services | They print per-query noise (and, at this level, the SQL parameters of every statement) in every environment. INFO is the default |
| Put `logging.level.org.example.backend.mapper=DEBUG` (the project's mapper package) in `application-dev.properties` only, as an opt-in | That prints the SQL **statements** and parameters (what you actually want when debugging), without the SqlSession/connection chatter |
| Keep `logging.level.org.mybatis.spring.SqlSessionUtils=WARN` in dev | Silences exactly the "not registered for synchronization" and "Closing non transactional" lines you pasted |
| Leave `com.zaxxer.hikari` at INFO | Start-up and pool-exhaustion warnings stay visible |

Production should never log SQL parameters at DEBUG (they can contain account data); this change makes that the default.

## 5. Optional improvement the log points at: read paths without a transaction

Each `Creating a new SqlSession ... Closing non transactional SqlSession` pair is one query holding its own connection. A request that makes
several reads (portfolio, orders listing, the account overview) therefore borrows several connections one after another, and the reads are not
one consistent snapshot. Marking read-only service methods `@Transactional(readOnly = true)` makes the request use **one** connection and one snapshot,
and removes most of the log lines on its own. This is a code change in the services, not configuration, so it is separate from steps 1-4:
1. List the read-heavy service methods (portfolio summary and positions, order history, account overview, notifications list, strategy list).
2. Add `@Transactional(readOnly = true)` and confirm with the tests; the read-only guard test of the portfolio module is unaffected.
3. Do **not** wrap the Kafka-consumer and strategy-claim code: those already use explicit transactions and conditional updates for correctness.

## 6. Work breakdown
1. Add the Hikari properties and pool names to both `application.properties`, the leak-detection line to the dev profiles, env overrides to `.env.example` and `docker-compose.yml` (`DB_POOL_MAX`, `DB_POOL_MIN_IDLE`, `DB_POOL_CONNECTION_TIMEOUT_MS`).
2. Logging clean-up (section 4) in both services and both dev profiles.
3. Expose `health,metrics` in the executor's dev profile; document the metrics.
4. Run the two services and a click-through (and one active strategy); read the Hikari metrics; adjust the sizes.
5. (Optional) Section 5 in a follow-up change.
6. Note the decision in the services' READMEs.

## 7. Acceptance criteria
- Starting either service in dev prints no `SqlSession ... not registered` lines; mapper SQL statements still appear when `org.example.backend.mapper=DEBUG` is on.
- `/actuator/metrics/hikaricp.connections.max` shows the configured size and the pool name identifies the service.
- With the pool deliberately exhausted (a test with a tiny `DB_POOL_MAX`), requests fail after about 5 seconds with a clear error instead of hanging for 30.
- Connections used by the two services together stay below 30 in normal use.

## 8. Open questions
1. Is the production database shared with other applications (so the 100-connection budget is smaller)? If so, lower the two sizes accordingly.
2. Is `trading_db` expected to run behind a connection proxy (PgBouncer, RDS Proxy)? That changes `max-lifetime` and prepared-statement settings.
