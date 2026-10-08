# 17 · Complete logging: JSON, traceable, human-readable, no sensitive data, no unhandled exceptions

Status: **plan** (large; touches both Spring services, about 100 files). The auth-service already has decent logging and is out of scope except for keeping its field names compatible.

## 1. Goal

For **order-service** and **executor-service**:
1. Every log line is **one JSON object** on stdout: timestamp, level, message, where it came from, plus the context needed to follow one request or one event across services.
2. **Every action leaves a log** (what was done and what came of it), and **every exception is handled and logged exactly once**, with a proper message and no stack-trace spam for expected outcomes.
3. A small **logger wrapper** that makes the right thing the easy thing, so traceability (Datadog or OpenTelemetry) works without anyone thinking about it, and sensitive data cannot be logged by accident.
4. Messages read like a person wrote them for the action at hand: varied wording, a consistent shape, no templates that could be generated from a method name.
5. Noise gone: no DEBUG, no framework chatter. Pure application actions.

## 2. What the code looks like today (audit)

| Finding | Detail |
|---|---|
| **No log format control** | No `logback*.xml`, no structured logging. Output is Spring Boot's default text pattern with stack traces over many lines |
| **Debug noise on in every environment** | `logging.level.org.mybatis=DEBUG` and `org.springframework.jdbc=DEBUG` in **both** services (the `SqlSession ... not registered for synchronization` flood; see plan 09) |
| **The core actions are silent** | `TradeService` (659 lines: place order, cancel, create and link account) has **0** log calls. `OrderSettlementService` (fill and reject settlement, 254 lines) has **0**. `ApiExceptionHandler` logs only the 500 fallback; every domain error (insufficient funds, not found, duplicate, FX unavailable 503) and every validation error is returned silently |
| **Coverage by package** | order-service: 32 of 281 files have a logger (about 70 log calls in total; whole packages such as `controller`, `mapper`, `exceptions`, `repository` have none). executor-service: 16 of 70 (about 50 calls) |
| **No exception advice in the executor** | `executor-service` has no `@RestControllerAdvice` at all: `MarketController` errors fall through to Spring's default error page and a raw stack trace |
| **Seven separate advices in order-service** | `ApiExceptionHandler` plus one each for notifications, portfolio, preferences, signals, strategy, watchlist. Each decides on its own whether to log; most do not |
| **Swallowed or silent catches** | 73 `catch` blocks in order-service and 37 in executor-service; about **13 and 7** neither log nor rethrow (for example the Fauxnance quote and candle sources, `ApiAuthenticationFilter` JWT failures, `OrderApiClient` IO errors, `StrategyWorker` FX failure and `InterruptedException`, `PortfolioHealth`). Some are deliberate; none say so |
| **Kafka and jobs** | Five `@KafkaListener`s and six `@Scheduled` jobs. Error handlers exist on the Kafka configs, but a failed record, a poison message or a crashed job is not logged in a consistent, searchable way; scheduled jobs have no uncaught-error handler |
| **Sensitive data in a log call** | `ApiAuthenticationFilter`: `logger.warn("Invalid dev token format: {}", token)` writes the **token itself**. Other lines put user and account ids into free text |
| **No correlation** | No request id, no trace id, no span id, no user/account context; the same request cannot be followed through the filter, the service, Kafka and the executor |
| **Message style** | A mix: machine-ish (`Unhandled exception on POST /api/v1/orders`), SQL-ish, apologetic. Some include `ex.getMessage()` of library exceptions (can carry SQL, tokens or URLs) |

## 3. The log line

### 3.1 Shape (flat top-level keys plus a few nested objects, as Datadog and OpenTelemetry both like)

```json
{
  "timestamp": "2026-10-08T08:33:11.482Z",
  "level": "INFO",
  "message": "Filled order 4821: 5 AAPL at 331.20, settled in the account's currency",
  "event": "order.filled",
  "logger": { "name": "org.example.trade_executor.service.OrderSettlementService", "thread": "order-consumer-0-C-1" },
  "service": "executor-service",
  "env": "dev",
  "version": "0.0.1-SNAPSHOT",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "request_id": "6f1c5e1e-8d1f-4d5c-9d3b-2f0f2c7a9a10",
  "user_id": 42,
  "account_id": 1001,
  "order_id": 4821,
  "symbol": "AAPL",
  "duration_ms": 37
}
```
An error adds `"error": { "kind": "org.postgresql.util.PSQLException", "message": "<cleaned, cut>", "stack": "<top frames, root cause>" }`.

| Field | Meaning | Always? |
|---|---|---|
| `timestamp` | ISO-8601 in UTC with milliseconds | yes |
| `level` | `INFO`, `WARN`, `ERROR` (Datadog and OTel map this to severity) | yes |
| `message` | The human sentence (section 5) | yes |
| `event` | A stable machine key (`order.placed`, `strategy.claimed`, `kafka.event.poisoned`). Lets people query and alert without parsing prose. The prose can be reworded freely; the key does not change | yes |
| `logger.name` | The class that logged: this is the "from what file" (class name equals file name). The wrapper can also add `caller` (`TradeService.placeOrder:214`), which costs CPU, so it is off by default and on in dev (decision D3) | yes |
| `logger.thread` | Thread name | yes |
| `service`, `env`, `version` | From `spring.application.name`, `DEPLOY_ENV` and the build version | yes |
| `trace_id`, `span_id` | OpenTelemetry/W3C names; set by an agent when one is attached, or by our own filter otherwise (section 7) | when in a request, event or job |
| `request_id` | One id per HTTP request, echoed in the `X-Request-Id` response header | HTTP |
| `user_id`, `account_id` | Internal numeric ids, **as fields only** (never in the message) | when known |
| business keys | `order_id`, `strategy_id`, `symbol`, `side`, `quantity`, `notification_id`, `job`, ... from an **allow-list** (section 4.2) | per event |
| `http` | `{ "method", "route", "status", "duration_ms" }` on the access line and on error lines | HTTP |
| `kafka` | `{ "topic", "partition", "offset", "event_id" }` on consumer lines | Kafka |
| `error` | `{ "kind", "message", "stack" }` | exceptions |

### 3.2 Format rules
- **One line per event** (no pretty printing; stack traces are a JSON string with `\n` escapes, so a trace never splits into many log lines).
- Output goes to **stdout only**; no file appenders (the platform, Docker or the Datadog Agent collects it).
- Nulls are omitted; unknown keys are never added.
- A `LOG_FORMAT=text` environment override gives the old readable console output for people who prefer it locally; JSON is the default everywhere.

## 4. Implementation

### 4.1 Use Spring Boot's structured logging (no new library)
Spring Boot supports structured JSON console output (`logging.structured.format.console`), including a **custom formatter class**, and includes MDC entries and SLF4J key-value pairs in the JSON. So:
- A small `PlatformJsonFormatter` (one class per service, about 150 lines) writes the shape above. Set `logging.structured.format.console=<its class name>` in `application.properties`.
- The formatter is responsible for: field names and order, UTC timestamp, merging MDC and key-values, the `error` object, escaping, single-line output, and the **last-resort redaction** (4.3).
- No `logstash-logback-encoder`, no Logback XML, no extra dependency.
- The two services do not share a library, so the same small `logging` package (formatter, wrapper, context helpers) is **duplicated** into each (`org.example.backend.logging`, `org.example.trade_executor.logging`) with a test that fails when the two copies drift (the repo already does this for SQL scripts). Alternative: a tiny shared Maven module (decision D2).

### 4.2 The wrapper: `ActionLog`
A thin, typed layer over SLF4J 2's fluent API. It is the **only** way application code logs (a build test bans direct `Logger` use, `System.out` and `printStackTrace` in main code).

```java
private static final ActionLog log = ActionLog.of(TradeService.class);

log.info(Event.ORDER_PLACED)
   .with(Field.ORDER_ID, orderId).with(Field.SYMBOL, symbol).with(Field.SIDE, side).with(Field.QUANTITY, quantity)
   .say("Accepted a market {} of {} {}; it is queued for execution as order {}", side.lower(), quantity, symbol, orderId);

log.warn(Event.FX_UNAVAILABLE).cause(ex)
   .say("Exchange rates could not be refreshed (HTTP {}); carrying on with the ones from {} minutes ago", status, age);

try (var timing = log.timed(Event.NAV_JOB_RUN)) { ... }     // adds duration_ms, logs on close
```
What it guarantees by construction:
| Guarantee | How |
|---|---|
| **Only approved fields** | `Field` is an enum (ORDER_ID, STRATEGY_ID, ACCOUNT_ID, USER_ID, SYMBOL, SIDE, QUANTITY, PRICE, STATUS, COUNT, DURATION_MS, TOPIC, PARTITION, OFFSET, EVENT_ID, JOB, REASON_CODE, ...). There is **no** method that takes an arbitrary map or key, so a password, token, name, email, phone, balance or account number has no way in. A new field needs a code change and a review |
| **Every line has an event key** | `Event` is an enum; `info(Event)` is the only entry point |
| **Exceptions are rendered safely** | `.cause(ex)` records `error.kind`, a cleaned and length-capped `error.message` and a trimmed stack (top frames plus the root cause) for ERROR; WARN gets kind and message only, no stack |
| **Parameters, not concatenation** | `say(pattern, args)` is SLF4J's `{}` form; no string building on the hot path, and the message is not computed when the level is off |
| **Context is automatic** | Request/event/job context is read from MDC (4.4); callers do not pass it |

`Event` names are `domain.action` (`order.placed`, `order.rejected`, `order.cancelled`, `strategy.fired`, `notification.recorded`, `email.sent`, `quote.refresh.failed`, `kafka.event.poisoned`, `job.finished`, `http.request`). The catalogue lives in one file and is documented in `documentation/readme/LOGGING.md` once built.

### 4.3 Redaction (defence in depth, because people make mistakes)
1. **By construction** (4.2): approved fields only.
2. **In the formatter**, applied to `message` and `error.message`/`error.stack`: mask `Bearer <token>` and `Authorization:` values, JWT-shaped strings (`xxx.yyy.zzz`), key=value pairs for `password|secret|token|api[_-]?key|authorization`, email addresses, runs of 12+ digits (account/card-like numbers), and the value of any URL query parameter named `key`/`apiKey`/`token` (the ExchangeRate-API key is part of its URL).
3. **Exception messages** from libraries are cleaned and cut at 300 characters (JDBC messages can contain SQL parameters; HTTP client messages can contain URLs).
4. **Never logged, by policy:** request or response bodies, headers, cookies, tokens, passwords, API keys, names, emails, phone numbers, dates of birth, account numbers (`ACC-...`), balances and order totals. Allowed: internal numeric ids as **fields**, symbol, side, quantity, unit price, status and counts.
5. **Tests** enforce all of it (section 9). Fix on day one: the `Invalid dev token format: {}` line that writes the token.

### 4.4 Context: how a line knows who and what it is about
Done once, in infrastructure, never by feature code (all through MDC, which the formatter already includes):
| Where | Set |
|---|---|
| **HTTP**: a `RequestContextFilter` early in the chain (before `ApiAuthenticationFilter`) | `request_id` (from `X-Request-Id` or generated, echoed in the response), `trace_id`/`span_id` (section 7), `http.method`, `http.route` (the route **template**, not the raw path with ids). After authentication the filter adds `user_id` and, when a path or body carries it, `account_id`. Clears everything in `finally` |
| **Kafka consumers**: a record interceptor on every listener container factory (5 listeners, 5 configs) | `kafka.topic/partition/offset`, `event_id` (from the envelope), `trace_id` (from the record's `traceparent` header if present), `account_id` once parsed |
| **Scheduled jobs**: one `JobRunner` wrapper (or an aspect on `@Scheduled`) | `job` (`email-dispatcher`, `nav-job`, `market-poller`, `strategy-sweeper`, ...), a fresh trace id, `duration_ms`, and a `job.finished`/`job.failed` line, so a crashed job always logs |
| **Executor strategy worker**: per quote | `strategy_id`, `symbol`, `run`; and outgoing HTTP to the order-service carries `traceparent` and `X-Request-Id` |

### 4.5 One access line per request
`http.request` at INFO from the filter: method, route template, status, duration. To keep volume sane (the UI polls): **all non-GET requests and every response with status 400 or more are logged; successful GETs are not** (a setting, `logging.access.include-reads=false`). `/actuator/*` and `/health` are never logged.

## 5. The messages: human, varied, with a consistent shape

### 5.1 Style guide
1. **One sentence, no trailing full stop**, sentence case. A colon may add the reason: `Order 4822 was turned down: not enough cash for 50 INFY.NS`.
2. **Say what happened to what**, in plain English, with the details a person would want: symbol, quantity, side, ids of the thing acted on, counts, durations, the reason.
3. **Tense carries meaning**: past for something done (`Accepted`, `Filled`, `Cancelled`), present continuous for something under way (`Waiting for`, `Retrying`), a plain statement for state (`No quotes are older than ...`).
4. **Wording follows the action; it is not a template.** Different actions use different verbs and sentence shapes (accepted, turned down, set aside, picked up, handed over, gave up, carried on). Do not start every line with "Order" or the class name, do not repeat the same skeleton with different nouns.
5. **Say what happens next when it matters**: `...; the next run carries on`, `...; it will not be retried`, `...; serving the last known quotes instead`.
6. **No people, no secrets** (section 4.3). ids of orders, strategies and notifications in the message are fine; user and account ids are fields.
7. **Not an essay**: aim for 8 to 20 words. Detail that is only useful in a failure goes in `error`, not the sentence.
8. **No blame, no jargon, no code names**: `The quote provider did not answer in time`, not `FauxnanceQuoteClient threw SocketTimeoutException`.

### 5.2 Levels
| Level | Use for | Examples |
|---|---|---|
| `ERROR` | Something broke that we must look at: an unexpected exception (HTTP 500), a lost or unprocessable event after retries, a job that crashed, start-up failure | unhandled exception, event sent to the dead-letter topic, `NavJob` crashed |
| `WARN` | Handled but unusual or degraded: an upstream failed and we fell back, a retry, a poison message set aside, a request refused for a security reason, a limit hit | FX provider failed, using cached rates; strategy blocked by its cap; expired token on a mutating call |
| `INFO` | A business action or lifecycle step that completed, or an expected refusal | order accepted/filled/rejected/cancelled, account opened, strategy created/fired/switched off, notification recorded, email sent, job finished, service started |
| `DEBUG`/`TRACE` | **Not used in application code, and off in every environment** | |

Expected business outcomes (insufficient funds, validation errors, not found) are **INFO or WARN without a stack trace**, never ERROR.

### 5.3 Before and after (real lines from the code, and the silent paths)

| Where | Today | Proposed `message` | `event`, level |
|---|---|---|---|
| `TradeService.placeOrder` | (nothing) | `Accepted a market buy of 5 AAPL; it is queued for execution as order 4821` | `order.placed`, INFO |
| `TradeService.placeOrder` (repeat key) | (nothing; a 409 is returned) | `Ignored a repeat of order 4821: that idempotency key was already used` | `order.duplicate`, INFO |
| `TradeService.cancelOrder` | (nothing) | `Order 4821 was cancelled before it filled` | `order.cancelled`, INFO |
| `ApiExceptionHandler` domain error | (nothing) | `Turned down a request to place an order: the account does not have enough cash` | `request.refused`, INFO (WARN for 5xx-class domain errors such as FX unavailable) |
| `OrderSettlementService` fill | (nothing) | `Filled order 4821: 5 AAPL at 331.20, settled in the account's currency` | `order.filled`, INFO |
| `OrderSettlementService` reject | (nothing) | `Order 4822 was rejected at execution: there were not enough shares to sell` | `order.rejected`, INFO |
| FX | `Exchange rate refresh failed, using rates from {}: {}` | `Exchange rates could not be refreshed; carrying on with the ones from 12 minutes ago` | `fx.refresh.failed`, WARN, `.cause(ex)` |
| Quote source | `Quote refresh failed ({}); serving the last known quotes where there are any` | `The quote provider did not answer; showing the last known prices instead` | `quote.refresh.failed`, WARN |
| Notifications | `Recorded notification {} for account {} on [{}]` | `Recorded notification 910 for delivery in the app and by email` | `notification.recorded`, INFO |
| Email | `Email delivery {} not sent (attempt {} of {}): {}` | `Email for notification 910 was not accepted by the mail server (attempt 2 of 3); it will be tried again` | `email.failed`, WARN |
| Email | (nothing on success) | `Sent the email for notification 910` | `email.sent`, INFO |
| Auth filter | `Invalid dev token format: {}` (**leaks the token**) | `Rejected a request: the sign-in token was not in a format this service accepts` | `auth.rejected`, WARN, field `reason_code=TOKEN_FORMAT` |
| Auth filter | `JWT token has expired: {}` | `Rejected a request to POST /api/v1/orders: the sign-in token had expired` | `auth.rejected`, INFO |
| Strategy | (claim and order logs exist, differently worded) | `Strategy 12 fired: AAPL fell to its level of 150, so a market buy of 5 is being sent` | `strategy.fired`, INFO |
| Strategy | | `Strategy 12 was blocked: the order would cost more than its spending cap` | `strategy.blocked`, WARN |
| Kafka | (poison handling in each config) | `Set aside an unreadable trade event (partition 2, offset 981); it will not be retried` | `kafka.event.poisoned`, ERROR |
| Job | `Portfolio history: the candle budget or quota is spent for this run; the rest resumes next run` | `Portfolio history stopped early because today's quote allowance is used up; the rest runs tomorrow` | `job.finished`, INFO, `count`, `duration_ms` |
| Start-up | (Spring banner and framework lines) | `order-service is ready on port 8081 after 6.2 seconds` | `service.started`, INFO |

## 6. Cutting the noise (configuration, both services)
- **Remove** `logging.level.org.mybatis=DEBUG` and `logging.level.org.springframework.jdbc=DEBUG`.
- Set `logging.level.root=INFO`; `org.springframework`, `org.apache`, `org.hibernate.validator`, `org.mybatis`, `com.zaxxer.hikari`, `org.apache.kafka`, `org.eclipse` to `WARN`; keep one `service.started` line of our own and set `spring.main.banner-mode=off`.
- No DEBUG or TRACE statements in application code; the wrapper has no `debug` method.
- Kafka client chatter (`ConsumerCoordinator`, `Metadata`) is at WARN; the application logs its own consumer lines.
- Docker Compose: `json-file` logging with `max-size` and `max-file` so JSON lines are rotated.

## 7. Traceability for Datadog or OpenTelemetry

The log shape is deliberately compatible with both, so **attaching an agent is all that is needed in deployment**; our own context is the fallback.

| Piece | Datadog | OpenTelemetry |
|---|---|---|
| Collect | The Datadog Agent tails container stdout (JSON is parsed automatically) | The Collector's `filelog`/container receiver, or the OTel Java agent's log appender |
| Severity and message | `level` and `message` map to status and message | `level` maps to severity, `message` to the log body |
| Service identity | `service`, `env`, `version` (reserved Datadog attributes; also set via `DD_SERVICE`, `DD_ENV`, `DD_VERSION`) | `service` and `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=...,service.version=...` |
| Trace correlation | `dd-java-agent` injects `dd.trace_id` and `dd.span_id` into MDC; the formatter emits MDC keys, so lines link to traces with no code | The OTel Java agent injects `trace_id`, `span_id`, `trace_flags` into MDC; same |
| Without an agent | Our `RequestContextFilter` reads a W3C `traceparent` header or generates a trace id (32 hex) and span id (16 hex), so logs of **one request still correlate**, and the id is returned in `X-Request-Id` | same |
| Across services | Order-service to Kafka: a producer interceptor writes `traceparent` into the record headers; the executor's record interceptor reads it, so the fill is in the **same trace** as the order. Executor to order-service (strategy orders, `OrderApiClient`): sends `traceparent` and `X-Request-Id` | same |
| Facets and alerts | Facets on `event`, `level`, `service`, `symbol`, `error.kind`; monitors on `event:job.failed`, `level:ERROR`, `event:kafka.event.poisoned` | same attributes |

No tracing library is added by this plan. (If spans, not just correlated logs, are wanted later, attach the OpenTelemetry Java agent: zero code change.)

## 8. Exceptions: nothing left unhandled

### 8.1 One place per entry point, one log per error
| Entry point | Handling today | Target |
|---|---|---|
| **REST, order-service** | Seven separate advices; only the 500 fallback logs | Keep the advices (each owns its HTTP mapping) but make them all call one `ErrorLogger.log(ex, status, code)`, so **every error response is logged exactly once** with `http.*`, `error.code` and the right level: 4xx expected -> INFO/WARN no stack; 5xx -> ERROR with stack; plus a catch-all `@ExceptionHandler(Throwable.class)` ordered last, and handlers for the Spring MVC exceptions that bypass advices (`HttpRequestMethodNotSupported`, `HttpMediaTypeNotSupported`, `MissingRequestHeader`, `AsyncRequestTimeout`, `DataAccessException` -> 503/500 with a safe message) |
| **REST, executor-service** | None | Add `ExecutorExceptionHandler` (`@RestControllerAdvice`) for `MarketController` and the platform error envelope, using the same `ErrorLogger` |
| **Servlet filters** (`ApiAuthenticationFilter`, the new context filter) | Some `catch` blocks log, some swallow; an exception thrown in a filter bypasses the advices | Wrap each filter body so any exception is logged with context and answered with the platform error envelope (401/500), never a container error page; the JWT failure branches log one `auth.rejected` line each (no token, no raw library message) |
| **Kafka listeners** (5) | Error handlers exist per config, inconsistently logged | One shared `LoggingErrorHandler`/recoverer wrapper: every failed record logs `kafka.event.failed` (WARN on retry, ERROR when set aside or sent to the dead-letter topic) with topic, partition, offset and `event_id`; malformed messages are `kafka.event.poisoned` |
| **Scheduled jobs** (6) | `try/catch` in some | One `JobRunner` (or `TaskScheduler` error handler plus an aspect): any exception from a job is logged as `job.failed` with the job name and duration and does not kill the schedule |
| **Threads** | No handler | `Thread.setDefaultUncaughtExceptionHandler` and an `@Async`/executor uncaught handler that log `thread.crashed` at ERROR |
| **Start-up and shutdown** | Framework output only | Log `service.started`, `service.stopping`; log a clear ERROR with cause when the context fails to start (failure analyzers already print text; add one structured `service.start.failed` line) |
| **Outbound calls** (Fauxnance, ExchangeRate-API, Gemini, order-service from the executor) | Each client handles its own | Each failure maps to a typed outcome and **one** WARN with the dependency name, status or timeout kind and what the service did instead; no raw URLs |

### 8.2 The 20 silent catches
Walk the list (13 in order-service and 7 in executor-service, found by scanning every `catch` for a log call or rethrow; the first step of P1 is to regenerate that list) and for each:
1. **Handled and expected** (a number that does not parse, an unknown enum from a newer version): keep, add a one-line comment `// intentionally ignored: ...`, and log at WARN only if it hides data loss.
2. **A real failure we continue past** (candle or quote fetch, FX, `PortfolioHealth`, executor `OrderApiClient` IO errors, `StrategyWorker` FX): log through `ActionLog` with `.cause(ex)` and the fallback taken.
3. **`InterruptedException`**: restore the interrupt flag **and** log `thread.interrupted` at WARN.
A build test fails on an empty `catch` block with neither a log call, a rethrow nor an `intentionally ignored` comment.

## 9. Tests (what proves it)
| Test | Proves |
|---|---|
| `PlatformJsonFormatterTest` | Output is valid single-line JSON; required keys present; UTC timestamp; MDC and key-values merged; nulls omitted; unicode and quotes escaped; stack trace is one escaped string; unknown fields cannot appear |
| `ActionLogTest` | Only `Field` keys accepted; `Event` required; `.cause` renders kind/message/stack (stack on ERROR only); parameters formatted; no work done when the level is off |
| `RedactionTest` | Bearer tokens, JWTs, emails, 12+ digit numbers, `password=...`, `api_key=...` and URL `?key=` values are masked in message, `error.message` and stack, and cannot be re-introduced by a library exception message |
| Advice tests (one per advice) | Each exception class maps to the right status and code **and** logs exactly once at the right level; a 5xx logs a stack; a 4xx does not |
| Executor advice and `MarketController` test | A failing quote call returns the platform envelope and logs once |
| Kafka and job tests | A poison record, a failing record and a crashing job each log the right event with topic/offset or job name and do not stop the container/schedule |
| `LoggingRulesTest` (architecture, by scanning source like the existing guard tests) | No `System.out/err`, no `printStackTrace`, no direct `org.slf4j.Logger`/`LoggerFactory` outside `logging`, no `debug`/`trace`, no empty catch without log/rethrow/`intentionally ignored`, no log call whose arguments name `password`, `token`, `secret`, `authorization`, `email`, `phone`, `cookie` |
| `LogMessageStyleTest` (cheap lint) | Messages are 3 to 25 words, do not end with a full stop, do not contain `Exception`, `null`, or a class name |
| Duplication sync test | The two copies of the `logging` package are identical |
| Existing tests | Keep passing; some assert on log output or on handler responses and need small updates |

## 10. Work breakdown

| Phase | Work | Size |
|---|---|---|
| **P0 Foundation** | `logging` package (formatter, `ActionLog`, `Event`, `Field`, redaction, `RequestContextFilter`, Kafka record interceptor, `JobRunner`, uncaught handlers) in **both** services; config changes of section 6 (JSON on, DEBUG off); formatter, wrapper, redaction and rules tests | 1 to 2 weeks |
| **P1 Exceptions** | Shared `ErrorLogger`; wire all seven order-service advices; new executor advice; catch-all and Spring MVC handlers; filter hardening; Kafka error-handler logging; scheduler handler; resolve the 20 silent catches; fix the token leak; advice and Kafka tests | 1 week |
| **P2 order-service actions** | `TradeService` and orders first (place, duplicate, cancel, create/link account), security filter, notifications (record, send, skip), portfolio (quote refresh, ledger, NAV job, health), signals (fetch, explain, chat limit), watchlist (alert fired, redelivery), strategies (create, toggle, cancel, announce), preferences (update, defaults fallback), fx; convert the ~70 existing log calls to `ActionLog` and the new wording | 1.5 to 2 weeks |
| **P3 executor-service actions** | `OrderPlacedConsumer`, `TradeExecutorService`, `OrderSettlementService` (fill/reject), `MarketDataPoller` (batch summaries, **not per tick**), quote/FX clients, `MarketController`, `StrategyQuoteConsumer`, `StrategyWorker` (arm, trigger, claim, limits, order, result), `StrategySweeper`, `OrderApiClient`; convert the ~50 existing calls | 1 week |
| **P4 Tracing and docs** | `traceparent` and `X-Request-Id` on Kafka producer and executor HTTP client; consumer interceptor continues the trace; `documentation/readme/LOGGING.md` (shape, event catalogue, style guide, levels, redaction policy, Datadog/OTel setup, example queries); update `DOCKER.md` and service READMEs | 3 to 4 days |
| **P5 Review** | Run the platform end to end (place an order, fill, strategy, notification, email), read the logs for one order across both services, tune volume (access line, poller), remove unused events | 2 to 3 days |

Each phase leaves the services working; P0 alone already gives JSON logs and removes the debug noise.

## 11. Acceptance criteria
- Every line from either service is valid single-line JSON with `timestamp`, `level`, `message`, `event`, `logger.name`, `service`.
- One order can be followed by `trace_id` or `request_id` from the HTTP request, through the order-service, the Kafka event, the executor's fill and the notification.
- Every exception class in the matrix is handled and logged once; an induced failure in each entry point (HTTP, filter, Kafka record, scheduled job, thread) produces a structured `ERROR`/`WARN` and the process keeps running.
- No DEBUG or framework chatter at default settings; log volume for an idle platform is a handful of lines per minute.
- No sensitive data: the redaction and rules tests pass, and a manual grep of a full run's output for tokens, emails, passwords, account numbers and API keys finds nothing.
- Messages read as natural sentences and vary with the action; the style test passes.
- The auth-service log fields (`level`, `message`, `timestamp`, `service`) stay compatible so one Datadog pipeline can read all three services.

## 12. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Custom formatter on Spring Boot's structured logging, or add `logstash-logback-encoder` | Boot's structured logging with a custom formatter: no new dependency |
| D2 | Duplicate the `logging` package with a sync test, or a shared Maven module | Duplicate for now (the services do not share a library today); promote to a module if a third consumer appears |
| D3 | Include `caller` (method:line) in every line? | Off by default (CPU cost); logger name is enough in production; on in `dev` |
| D4 | Are internal numeric `user_id` and `account_id` acceptable as fields? | Yes, as fields only and never in the message: they identify nothing outside the database. A stricter option is an HMAC pseudonym (`account_ref`) at the cost of operability |
| D5 | Log successful GETs? | No (UI polling would dominate the volume); log all mutations and every 4xx/5xx |
| D6 | JSON only, or a readable local format as well | JSON by default; `LOG_FORMAT=text` as an opt-in for local reading |
| D7 | Attach an APM agent now or later? | Later, in deployment; the log shape already supports it |
