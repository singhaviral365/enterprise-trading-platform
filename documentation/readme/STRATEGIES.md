# Automated Strategy Execution

A customer sets a rule once: *buy 50 AAPL if it falls to 150*, or *sell 20 MSFT if it rises to 450*. The platform watches the
price and trades it for them, with nobody signed in and nobody confirming the order. That is the whole feature, and it is why every
control below is load-bearing: a defect here does not show a wrong number, it spends a customer's money.

Contract: [`contracts/strategies-api.yaml`](../../contracts/strategies-api.yaml). Change log: [`contracts/CONTRACT-CHANGES.md`](../../contracts/CONTRACT-CHANGES.md).

## The rules this is built around

1. **An order is placed only by `POST /api/v1/orders`.** Never published to the `orders` topic, never inserted into `orders`, never
   placed by calling the order service's code from strategy code. The route's validation, ownership check and idempotency check are
   what stand between a strategy bug and an unrecoverable position. `StrategyBoundaryTest` (one in each service) reads the strategy
   source and fails the build if it ever reaches order placement.
2. **Identity is decided and logged** (below).
3. **Damage is bounded in code, at the point of decision**: a maximum spend, a maximum position, a stop after repeated failures.
4. **Switching a strategy off stops orders now**, not at the end of a cycle, and that can be shown live.

## Who does what

| | Service | What |
|---|---|---|
| The rule | **order-service** (`org.example.backend.strategy`) | The `strategy` and `strategy_run` tables, the customer's routes (create, list, switch off and on, cancel, read the trail), ownership checks, creation-time validation, the notices |
| The trading | **executor-service** (`org.example.trade_executor.strategy`) | Reads each `market-data` quote, claims a triggered strategy, checks its limits, and places the order through the order route |
| The gate | **order-service** (`StrategyOrderGuard`, `StrategyOrderService`) | On the order route: an executor's token may place only the one order its strategy may place right now |

The two services share `trading_db`. The order-service owns the schema (`strategy-schema.sql`); the executor reads and moves rows with
its own small mapper, and the lifecycle trigger in the schema keeps the two from disagreeing about which moves are allowed.

## The flow

```
customer ── POST /api/v1/strategies ──► order-service ──► strategy (ACTIVE, limits, armed?)
                                                                    ▲ read fresh on every quote, never cached
market-data (Kafka) ──► strategy worker (executor-service, group strategy-worker)
        for each ACTIVE strategy on that instrument:
          1 armed?      un-armed: a quote on the safe side arms it; it never fires on any quote while un-armed
          2 triggered?  BELOW: price <= trigger   ABOVE: price >= trigger        (fresh quote, inside the window)
          3 CLAIM       UPDATE ... SET status='EXECUTING' WHERE status='ACTIVE' AND armed AND window open AND runs left
                        0 rows = stop. This is the only gate for "switched off means stopped"
          4 LIMITS      order value <= max, position <= max, holding enough to sell      (fresh reads, before any order)
          5 TOKEN       a signed token for the owner, valid about a minute, bound to this strategy
          6 LAST LOOK   UPDATE ... SET claimed_at=now() WHERE status='EXECUTING'  -> 0 rows = switched off meanwhile: no order
          7 ORDER       POST /api/v1/orders  (MARKET, key strat-{strategyId}-{run})
                                     │
                    order-service: ownership check ─► StrategyOrderGuard (shared row lock) ─► the ordinary placeOrder
          8 RECORD      the run on the strategy's trail and the strategy's new state, in one transaction
        then the offset is committed
trade-events ──► notifications: "Strategy #12 bought 50 AAPL at 149.80 ..." (category STRATEGY_EXECUTION)
```

No new Kafka topic: a quote is acted on as it arrives, with no queue between "the price crossed" and "place the order" for a
disabled strategy to slip through, and no second consumer to reason about.

### What "falls through a level" means

A strategy that fires on *any* price past its level would trade the moment it is created if the price were already there. So:

* creating one whose trigger the latest known price has already reached is refused (`STR-409`);
* if no recent price is known it is created **un-armed**, and the worker arms it on the first quote on the safe side, and only then
  can it fire;
* switching a strategy back on re-arms it the same way, and so does completing a run of a repeating strategy.

### States

```
              ┌──────── switch off ────────┐
              ▼                            │
 ACTIVE ──claim──► EXECUTING ──order placed──► EXECUTED (final, when no runs are left; else back to ACTIVE, un-armed)
   ▲ │                │ │ └──failure──► ACTIVE, or FAILED (final) after max_failures in a row
   │ └─ switch off ───┘ │
   └── switch on ── DISABLED ◄── switch off (also from EXECUTING)
 ACTIVE / DISABLED ──end date passes──► EXPIRED (final)       any open state ──cancel──► CANCELLED (final)
```

The database refuses to leave a final status, and refuses to claim anything that is not `ACTIVE`, whatever the code says.

## Decision log: identity

**The question.** A strategy trades when nobody is logged in, so it cannot borrow a customer's access token. The order route needs a
token whose subject owns the account. What does the platform use instead?

**Considered.**

| Option | Verdict |
|---|---|
| A standing "robot" user with a long-lived token that can place orders for any account | Rejected. It would be the most valuable credential on the platform: one leak trades for every customer, for as long as the token lives. It would also need the ownership check weakened or bypassed, which is exactly the check that must not be |
| A second order route for strategies (`/orders/strategy`) | Rejected. A second door duplicates the validation, authorisation and idempotency the first one has, and the brief says orders go through `POST /api/v1/orders` |
| Calling the order service's code or writing to `orders` directly | Rejected. It skips the route's checks |
| **A token minted per order, for the strategy's owner, valid about a minute, bound to one strategy** | **Chosen** |

**What was chosen.** For each order the executor signs a JWT with the same secret and issuer the order-service uses to verify the Auth
service's tokens:

* `sub` is **the strategy's owner**, so the order route's ordinary check ("does this user own this account?") is the one that runs,
  unchanged;
* `act=strategy-executor` and `strategy_id` say who is acting and for which strategy;
* it expires in about a minute (never more than two, whatever is configured);
* it is never stored or logged.

The order-service then treats such a token very differently from a customer's:

1. **It works on one request only.** `ApiAuthenticationFilter` refuses it everywhere except `POST /api/v1/orders` (a stolen one cannot
   read a balance, cancel an order or create a strategy), and the `act` claim is read only from a *signed* token: never from a
   development token.
2. **It places one order only.** `StrategyOrderGuard` checks, inside the transaction that places the order, with a shared lock on the
   strategy's row, that the strategy is `EXECUTING` (claimed), inside its window, has runs left, and that the order is exactly its
   own: account, instrument, side, quantity, market type, and idempotency key `strat-{id}-{next run}`. Anything else is `STR-403`,
   with the same message whatever the cause (the cause goes to the log).

**Blast radius if the signing secret leaks.** The same as for any token the Auth service signs, which is the secret's existing risk;
this adds one more holder of it (the executor) and nothing else. **Blast radius if one executor token leaks:** one customer, for under
two minutes, able to try one specific order that the strategy would place anyway, and only while it holds its claim.

**Accepted trade-off.** The executor holds the signing secret. The alternative is a token-exchange endpoint on the Auth service,
which is a second service to trust and the same boundary, so it was not worth the extra moving part for this project. If the secret
should not be shared, that endpoint is the next step.

## The controls, and where each one lives

| Control | Where | Test |
|---|---|---|
| Orders only through the route | `StrategyBoundaryTest` in both services | Fails the build on a reference to order placement, the orders topic or a write to `orders` |
| Customer owns the account / strategy | `StrategyAccess` (`ACC-403`; another's strategy is `STR-404`) | `StrategyServiceTest`, `StrategyControllerTest` |
| A strategy never trades the moment it is made | `armed`, the "already reached" refusal | `StrategyServiceTest`, `StrategyWorkerTest` |
| One claim wins | One `UPDATE ... WHERE status='ACTIVE' ...` | `ofManyWorkersClaimingAtOnceExactlyOneWins` (12 threads, real Postgres) |
| A duplicate delivery places one order | Key `strat-{id}-{run}` stays the same until a run succeeds; `ORD-409` is read as "already placed" | `StrategyWorkerTest`, `StrategyOrderGuardTest` |
| Maximum spend, position, holding to sell | `StrategyWorker.limitBreach`, fresh reads before the order, in the account's currency | `StrategyWorkerTest` |
| Stop after repeated failures | `recordFailure`: `FAILED` at `max_failures` in a row | `StrategyMapperDatabaseTest` |
| Switched off stops orders now | The claim, the last look, and the shared lock at the order route | `StrategyMapperDatabaseTest` (below) |
| A stale price is never traded on | `strategy.execution.max-quote-age-seconds` | `StrategyWorkerTest` |
| Kill switch | `STRATEGY_EXECUTION_ENABLED=false` on the executor | `StrategyWorkerTest` |
| A stolen token is nearly useless | The identity decision above | `StrategyExecutorTokenTest`, `StrategyOrderGuardTest` |
| Platform ceilings on what a customer may ask for | `strategy.limits.*` in the order-service | `StrategyServiceTest` |
| Crash recovery | `StrategySweeper` gives back claims older than `claim-timeout-seconds`; the same key makes a repeat harmless | `StrategyMapperDatabaseTest` |

## "Disabled" is demonstrated live, and what it proves

Set `STRATEGY_DEMO_DELAY_MILLIS=15000` for the executor and run it with the `dev` profile (it does nothing in any other profile, and is
capped at 60 s). The worker then holds the claim for 15 seconds before it sends the order.

1. Create a strategy on an instrument whose price you can move past its trigger (use `MARKET_DATA_WATCH_SYMBOLS` or a held symbol).
2. When the price crosses, the strategy shows **Running** on the Strategies page and the executor log says
   `DEMONSTRATION: holding the claim on strategy N`.
3. Press **Switch off**. The page answers at once.
4. After the pause the executor logs `switched off before its order was sent; no order placed`. Open **Activity** on the strategy:
   the run says *Switched off first*. Check **Order history**: there is no order.

What this proves, exactly:

* A switch-off **before the claim** means the strategy is not `ACTIVE`, the claim updates no row, nothing happens.
* A switch-off **after the claim and before the last look** is what the demo shows: the last look updates no row, no order is sent.
* A switch-off **after the last look** is caught by the order route: `StrategyOrderGuard` reads the strategy under a shared lock in the
  transaction that places the order. A switch-off needs the exclusive lock, so it either committed first (the guard sees `DISABLED`,
  `STR-403`, no order) or waits for the order's transaction (the order exists). `StrategyMapperDatabaseTest` demonstrates both orders
  of events against PostgreSQL.
* What cannot be undone: an order the route has **already accepted**. A switch-off does not recall it, and the page says so.

## Notifications

An order a strategy placed that is filled, rejected or cancelled is notified under the category **`STRATEGY_EXECUTION`**, in different
words from an ordinary order ("Strategy #12 bought 50 AAPL at 149.80 after the price reached your trigger of 150.00."). So are a
strategy the platform stopped after repeated failures, and one whose window closed. The customer switches this category on and off
in **Settings > Notification categories**, separately from order and watchlist notices; existing customers get it on.

The trade event carries only the order id, so the order-service recognises a strategy's order by its idempotency key
(`strat-{id}-{run}`, written in the same statement that creates the order) and checks the key belongs to the strategy's own account.
The executor cannot reach the notifications module, so stopped and expired strategies are announced by a small job in the
order-service (`StrategyAnnouncer`) that finds finished strategies not yet announced.

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `strategy.limits.max-open-per-account` | 20 | Open (active, running or switched-off) strategies per account |
| `strategy.limits.max-quantity` / `max-order-value` / `max-position-qty` | 1,000,000 / 10,000,000 / 10,000,000 | The platform's ceilings on what a customer may set |
| `strategy.limits.max-window-days` | 366 | How far ahead an end date may be |
| `strategy.limits.arm-fresh-seconds` | 300 | How recent a price must be to create a strategy already armed |
| `strategy.execution.enabled` (`STRATEGY_EXECUTION_ENABLED`) | true | The kill switch. Needs a restart of the executor |
| `strategy.execution.max-quote-age-seconds` | 180 | A quote older than this is never traded on |
| `strategy.execution.claim-timeout-seconds` | 120 | A claim older than this is taken to be abandoned |
| `strategy.order-api.base-url` (`ORDER_SERVICE_BASE_URL`) | `http://localhost:8081` | Where orders are placed |
| `strategy.token.ttl-seconds` | 60 (max 120) | How long an order's token lives |
| `strategy.demo.pre-order-delay-millis` (`STRATEGY_DEMO_DELAY_MILLIS`) | 0 | Development profile only |

The executor's consumer group is `strategy-worker` and starts at the end of `market-data` the first time, so a freshly deployed worker
never acts on a backlog of old prices.

## Existing databases

`databases/PostgreSQL/migrations/update_trading_db.sql` (regenerate with `python databases/PostgreSQL/tools/build_update_scripts.py`)
brings any existing `trading_db` up to date: it adds `strategy` and `strategy_run`, the `STRATEGY_EXECUTION` notification category
and `customer_preference.notify_strategy_execution`. A fresh database gets the same from `create_schema.sql`, and
`sample_data.sql` seeds four example strategies (two of them active with triggers far from any real price, so a development
machine never places an order from sample data by accident). `UpdateScriptSyncTest` fails when the script and its sources drift.

## Limits of this version (honest list)

* **One executor instance.** The claim is exclusive across any number of workers, but the kill switch and the demo delay are per
  process, and the token secret is shared with every executor.
* **Market orders only.** The price a strategy triggers on and the price the order fills at can differ.
* **Limits are checked in the account's currency at the rate the executor holds**; a limit near the cost of the order can be passed or
  missed by a rate move between the check and the fill.
* **A strategy on an instrument that is not being polled never fires.** The poller prices every symbol with an `ACTIVE` or `EXECUTING`
  strategy, but the Fauxnance daily quota still caps how often (`MARKET-POLLER.md`).
* **The order route checks funds when the order settles**, not when it is placed, so a strategy's own spend limit, not the route, is
  what caps what it can spend.
* **No end-to-end test of all three moving parts in CI**: the mapper tests need a database (`STRATEGY_TEST_JDBC_URL`), the rest run
  without Docker. The two-service flow is covered by the pieces: the worker against a stubbed route, the route's gate against the
  database, and the token read back by the verifier's own rules.
