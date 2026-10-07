# Plan: Portfolio and P&L, with end-of-day statements and a NAV performance curve

Status: **Track A and Track B are built** (sections 3 to 9, with the differences below). Written 2026-10-07 against the code on
`feature/notifications`, updated the same day with the product owner's answers (section 12), and implemented the same day.

**What was built, and where it differs from this plan**

* Built as planned: the contract (with the marked day-P&L additions), `realised_pnl_entry` and its schema in the fresh and update scripts, the
  ledger (consumer, reconciler, replay), the batched cached quote source with stale-while-error, the three routes and `/health`, the guards
  (read-only, independence, contract field names), the generated client and wrapper, the Portfolio page, and the specs and an e2e journey.
* **Sample data is not reconciled** (section 6.3 is deferred): the product owner chose to go with real data for now. A sale the history cannot
  support is skipped and logged by the reconciler, never guessed. `update_trading_db.sql` is still regenerated from the sources by
  `databases/PostgreSQL/tools/build_update_scripts.py`, which now lives in the repo.
* **The Positions page is folded into the Portfolio page.** (First built beside it, then merged on the product owner's request.) The cards, the
  table (now with price, market value, unrealised, today and a price status), paging and the position detail with its buy and sell are the
  Holdings section of `/portfolio`; `/positions` redirects there and the sidebar item is gone. The totals live in the tiles, so the table has
  no total row.
* **Two additions after the first build.** (1) A holding that existing orders do not explain is accounted for as an opening position, so selling
  it is booked instead of skipped. (2) `GET /api/v1/portfolio/{accountId}/realised` (a team extension) returns realised profit and loss without
  needing a price, and the Portfolio page uses it to keep showing what was realised while pricing is down.
* **Track B is built** behind `portfolio.performance.enabled`: `contracts/portfolio-performance-api.yaml`, the tables `price_candle_daily` and
  `portfolio_nav_daily` (`portfolio-performance-schema.sql`), the candle client with a call budget and a daily cache, `NavCalculator`, the
  closed-day statement service with a five-day healing window, the nightly `NavJob`, the on-demand single-flight build (HTTP 202 "building"),
  and `GET /api/v1/portfolio/{accountId}/performance`. Opening cash and opening positions are derived from the order history, so the curve
  works on real data without reconciled sample data. The page shows the curve straight under the tiles, on the shared `LineChart`.
* **The sections of the Portfolio page load independently**: the realised filter reloads only profit and loss, the benchmark toggle only the
  curve, each with its own spinner.
* Axe is not installed, so no axe check runs yet (section 9.1): the specs assert the structure axe looks at (captions, `scope`, roles, text
  alternatives for every colour). Install `axe-core` and a shared helper can be added.
* Needs the order-service to have `FAUXNANCE_BASE_URL` and `FAUXNANCE_API_KEY` (compose is updated; set them in your run configuration too).

Sources: `portfolio-pnl.md` (story catalogue), the Portfolio story's acceptance criteria and tasks, `contracts/portfolio-api.yaml`
(binding contract), `PORTFOLIO-HISTORY-PLAN.md` (the Zerodha-style NAV idea), and a read of the existing code (`TradeService`,
`OrderSettlementService`, `MarketDataPoller`, `CurrencyConversionService`, `QuoteDetails`, the notifications and watchlist modules,
the SQL scripts, the auth filter, the Angular app).

## 0. Read this first

1. **Two tracks, both approved.**
   * **Track A** is the story: three routes and a health check, priced holdings, realised and unrealised P&L, day P&L, stale and
     partial handling, the portfolio screen.
   * **Track B** is the end-of-day (EOD) statement and the NAV performance curve. It was "out of scope unless the rest is finished"
     in the catalogue; the product owner has approved it (it is still inside the Trade REST API, in the same package). It is
     **sequenced after Track A** and behind a switch, purely so that a problem in it can never delay or break the story. Nothing in A
     waits on B.
2. **Live P&L is never stored. EOD figures for a closed day are** (decision D11). Today's unrealised and day P&L come from the current
   quote and are computed on every request. Once a day has closed, its statement (value, cost basis, unrealised, cumulative realised,
   day P&L, NAV) is written once and not changed. That is what makes the NAV curve and a P&L history possible, and it is consistent
   with the contract's "unrealised is never persisted as a fact" because a closed day's number is a historical fact, not a live one.
3. **The sample data is reconciled for every account** (section 6.3), not just one, with a hard rule that **no account holding real
   orders is touched**. The user's own orders on sample accounts (for instance alice.trader's fills) must survive an update.
4. **Every database change moves five files together** (section 6.2): `create_schema.sql`, `sample_data.sql`, the order-service's
   startup schema, `update_trading_db.sql`, and `update_auth_db.sql` (which Portfolio does not change, and the plan says so).
5. The Angular work follows the rules in section 9.1 (signals, `@Service`, `inject()`, native control flow, signal forms, no
   `standalone: true`, WCAG AA / axe, design tokens only) and uses **only the generated client** for the API.

## 1. Requirements and how each is met

### 1.0 The story, line by line

**Acceptance criteria**

| # | Criterion | Where it is met |
|---|---|---|
| AC1 | Implements `portfolio-api.yaml` on the Trade REST API: three routes and the health check, exact field names, the contract's error catalogue | R1, R13, R15; section 7 (copied in, the client generated from it, so a renamed field breaks the build). The few additive fields for day P&L are marked and recorded (section 7) |
| AC2 | Positions priced from live Fauxnance quotes, batched and cached; every priced figure carries when it was observed and whether it is stale | R5, R8; section 4.3 (`QuoteCache`: one batched call per TTL; `priceAsOf` from the quote's `asOf`, `stale` from the quote's `stale`, its age and the cache) |
| AC3 | Pricing unavailable for **every** held instrument -> the documented service-unavailable code; for **some** -> partial, marked as the contract states | R10, R11; section 4.5 (`503 MKT-503`; `200` with the price omitted, `stale=true`, `partial=true`) |
| AC4 | Realised P&L **accumulated from sales**, not recomputed from today's price; the module writes only to tables of its own | R7, R12, R6; section 5 (ledger) and `PortfolioIsReadOnlyTest` |

**Tasks**

| Task | Where it is met |
|---|---|
| Read the contract's description block first; the definitions are most of the assessment | section 4.5 restates cost basis, market value, unrealised, realised and total exactly as defined, with a worked example reused by the tests |
| Own package inside the Trade REST API, own routes, own tables, own README; **compare the account claim with the path account on every route** | section 4.1 (`portfolio/`, `portfolio/README.md`); R3: the token's claim on this platform is the **user id**, and `PortfolioAccess` checks it against `account.user_id` for the path account, first thing on every route (decision D9) |
| Read quantity, average cost, instrument currency and cash balance **through the code that already owns them**; keep what the module owns in its own tables | sections 2 and 4.2: `TradeService.getPositions`, `TradeService.getBalance`, `TradeService.isAccountLinkedToUser`, `InstrumentMapper`, `CurrencyConversionService`, all in-process. Tables the module owns: `realised_pnl_entry` (A), `price_candle_daily`, `portfolio_nav_daily` (B) |
| Price with the batch quotes endpoint, up to 25 symbols per call, and cache | R8, section 4.3 |
| Convert a multi-currency total into one base currency; handle a currency that cannot be converted | R9, section 4.4 |
| Treat the trading tables as read-only; say in the decision log that only discipline and review stand in the way of a write | R6 (made mechanical by a test) and decision D6 |

**Unit-test execution paths** (each becomes a named test)

| # | Story path | Test (planned name) | What it asserts |
|---|---|---|---|
| 1 | positions are priced from a live quote | `PortfolioServiceTest.pricesPositionsFromALiveQuote` | a stubbed `QuoteSource` answers; `lastPrice`, `marketValue`, `unrealisedPnl`, `priceAsOf` filled, `stale=false` |
| 2 | a cached quote is reused within the cache window | `QuoteCacheTest.reusesAQuoteWithinTheWindow` | two calls inside the TTL make **one** source call; after the TTL, a second |
| 3 | pricing unavailable for every symbol returns the service-unavailable code | `PortfolioControllerTest.noPriceForAnySymbolIsMkt503` | `503`, `errorCode: MKT-503` on all three routes |
| 4 | unavailable for some symbols returns a partial answer marked as such | `PortfolioServiceTest.aPartialAnswerOmitsThePriceAndMarksIt` | `200`; the unpriced position has null price fields and `stale=true`; summary `partial=true` |
| 5 | realised P&L is booked at the sale and not recomputed | `RealisedPnlLedgerTest.booksAtTheSaleAndIgnoresLaterPrices` | book a sale, move the quote, read again: realised unchanged |
| 6 | a replayed event does not double-count | `FilledSellConsumerTest.aReplayedEventBooksNothingTwice` | the same `ORDER_FILLED` twice leaves one row and one sum |
| 7 | one account cannot read another account's portfolio | `PortfolioControllerTest.aForeignAccountIsForbidden` | `403 ACC-403` on each of the three routes, with the log line |

Beyond the seven: batching (10 holdings = 1 call, 30 = 2), multi-currency and an unconvertible currency, the replay's rounding against the
executor's, day P&L, the read-only guard, `/health`, sample-data coherence, and trading-still-works-with-Fauxnance-down (section 8).

**Notes**

| Note | Where it is met |
|---|---|
| Independent of the other three; start early because quota, stale quotes and currency are the risks | the module imports nothing from notifications, preferences or watchlist (an architecture test enforces it); the riskiest parts (A4 quotes, A5 currency and partial) come first |
| Stale is a state, not an error: serve the number and mark it | R5, section 4.3 (stale-while-error), and a UI marker that is an icon **and** the word "Delayed" |
| The browser never calls Fauxnance | R4; the Angular app talks only to the generated `portfolio` client |

### 1.1 Contract and catalogue requirements in detail

| # | Requirement | How it is met | Proven by |
|---|---|---|---|
| R1 | The contract binds: three routes + `/health`, exact field names, `MKT-503`, partial-answer rule | `contracts/portfolio-api.yaml` copied in; DTOs have the contract's shape; the client is generated from it | a contract test that serialises each DTO and validates it against the schema; `npm run api:check` |
| R2 | Own module on its own routes, reads the same positions, may fail without stopping trading | package `org.example.backend.portfolio`, no import from the order write path; its own exception handler; its own Kafka group and thread pool | architecture test; kill-Fauxnance test: orders still place |
| R3 | Access control on **every** route; mismatch = `403 ACC-403`, not 404, and logged | `PortfolioAccess.require(userId, accountId)` is the first line of every route (user from the token, link from `account.user_id`); an unknown account is `404 ACC-404`; a mismatch logs `WARN` with both ids | `PortfolioControllerTest.aForeignAccountIsForbidden` and the log assertion |
| R4 | The key stays server-side | the Fauxnance key is an environment value of the order-service only; no route returns it | the Angular app has no Fauxnance URL; a grep test on the contract and the DTOs |
| R5 | Stale is a state | `priceAsOf` and `stale` on every priced figure; stale-while-error cache; UI marker | `QuoteCacheTest`, UI spec |
| R6 | Read-only means read-only | the module writes only its own tables; a guard test scans the mapper XML (the `WatchlistPricesAreNotStoredTest` technique) | `PortfolioIsReadOnlyTest` |
| R7 | Definitions are the assessment | `PositionValuation` (pure) and `RealisedPnlLedger` | worked-example tests, including "price changes tomorrow, realised does not" |
| R8 | One batched call per refresh, max 25 symbols, quota 2000 a day | `QuoteCache` coalesces all accounts' requests into one `GET /quotes?symbols=` per TTL per 25 symbols | `QuoteBatchingTest` |
| R9 | More than one currency, total in one | quote converted to the account currency by `CurrencyConversionService`; if no rate, that position is unpriced | `MultiCurrencyValuationTest` |
| R10 | Some price, others do not: `200`, omit price, `stale=true`, `partial=true` | `PricedPosition` nulls; summary over the priced ones | `PartialPricingTest` |
| R11 | Nothing priced: `503 MKT-503`; the UI degrades to unpriced holdings | `PricingUnavailableException` -> `MKT-503`; banner in the UI | controller test, UI spec |
| R12 | Realised P&L accumulated from sales, not recomputed | ledger filled by a `trade-events` consumer **and** a reconciler; both idempotent on `order_id` | `LedgerIdempotencyTest`, `ReconcilerTest` |
| R13 | `/health` reports postgres and fauxnance, `200` even when degraded | outside `/api/**`, DB ping, last Fauxnance result, `/usage` at most every 10 minutes | `HealthControllerTest` |
| R14 | Batched, cached fetching; partial and stale paths visible in the UI | R8 + R5 + R10 rendered by the Portfolio page | UI specs and a Playwright journey with the quote source stubbed down |
| R15 | Served by the Trade REST API on 8080 | same Spring Boot app, no new deployable | startup test |
| R16 | Day P&L (catalogue: "profit and loss for the day") | served by the API from the quote's `previousClose` (live, not stored); exact EOD day P&L stored per closed day by Track B (section 4.6) | `DayPnlTest`, `NavCalculatorTest` |

### 1.2 Cross-cutting criteria from the Notifications story that also apply here

| Criterion | Portfolio equivalent |
|---|---|
| Own package, own routes, own tables, own README; authorise every route | R2, R3, `portfolio/README.md` |
| Idempotent on the event identifier; a second delivery is a no-op | ledger primary key `order_id`; `INSERT ... ON CONFLICT DO NOTHING` in both the consumer and the reconciler |
| Commit the offset once durably recorded | commit once the ledger row is written (or already exists) |
| History readable only by the owning account | R3 |

## 2. What exists today, and what that means for the design

| Fact in the code | Consequence |
|---|---|
| `holdings.purchase_price` is the weighted average cost and `orders.price` is overwritten with the **fill price**, both in the **account currency** (`OrderMapper.fillOrderIfNew`; `CURRENCY.md`) | cost basis needs no conversion; realised P&L can be replayed from `orders` with no price lookup |
| `OrderSettlementService.upsertBuyHolding`: new average = `(avg*oldQty + price*qty) / newQty`, scale 2 `HALF_UP`; a sell changes quantity and **never the average**; a fully sold row stays at quantity 0 | the replay in section 5 reproduces this exactly, including the rounding |
| The `trade-events` payload has `orderId, accountId, symbol, side, quantity, executionPrice` but **not the average cost at the sale** | the consumer replays the account's earlier fills (deterministic, so late or replayed delivery cannot change the answer) |
| Fauxnance quotes carry `asOf`, `stale`, `source`, `change`, `changePercent`, `previousClose`, `marketState` (see `QuoteDetails`) | observation time, staleness and the **previous close for day P&L** all come from the quote itself, with no extra call |
| The order-service has **no** Fauxnance client or key; the executor owns them. `MarketDataPoller` polls held and watched symbols and publishes `market-data` | the module has its own small batched client, and the order-service needs `FAUXNANCE_BASE_URL` / `FAUXNANCE_API_KEY` (compose, `.env`, the IntelliJ run configuration) |
| The watchlist module keeps `LatestQuoteStore` fed from `market-data` | **not used** from Portfolio: the story says it waits on nothing in the sprint |
| `TradeService.getBalance`, `getPositions`, `isAccountLinkedToUser`, `CurrencyConversionService.convert` already exist | reused in-process (no second query, no HTTP to ourselves) |
| The JWT carries the **user id** only. `ApiAuthenticationFilter` also sets a misnamed attribute `authenticatedAccountId` to that same user id ("backward compatible") | use `AuthContext.requiredUserId`; **never** `requiredAccountId`, which is the user id under a misleading name. Optional cleanup noted in the module README |
| Account ids live only in `trading_db`; `auth_db` has `user_id`; `account.user_id` is the connector | the ownership check is `account.user_id == token user id`, the same link the notifications module uses |
| `assertUserCanAccessAccount` answers **409** for someone else's account | Portfolio answers **403 `ACC-403`** (contract), through its own `PortfolioAccess` |
| `/actuator/health` exists; the contract's `/health` has a different body | a separate `HealthController` at `/health` |
| The sample data does not replay to its own holdings | reconciled for all accounts, with a rule protecting real data (section 6.3) |
| The order-service's real data already sits on sample accounts (the user's own fills) | the reconciliation of the sample data skips any account that has a non-seed order |
| The executor has `QuoteClient.getCandles` and a candle parser | Track B's client copies the parser; no dependency on the executor |
| `update_trading_db.sql` is built by a script that lives only in a scratch folder | moved into the repo (section 6.2) |

## 3. Track B: EOD statements and the NAV curve (approved)

The NAV idea (units, `NAV = value / units`, deposits create units at the previous NAV, so only the market moves the curve) is sound and
`PORTFOLIO-HISTORY-PLAN.md` is largely reused. It fits the story because:

1. **It lives in the same package, in the same service.** It is more data from the same module, on the same Trade REST API.
2. **Sequenced after Track A.** Not because it is forbidden, but so a problem in it cannot touch A. Nothing in A depends on B.
3. **Its own contract and route**, so the binding portfolio contract is not reshaped for it: `contracts/portfolio-performance-api.yaml`
   (`GET /api/v1/portfolio/{accountId}/performance`), same `ErrorResponse`, same access rules.
4. **Live figures are never stored; closed-day statements are** (D11). Track A's unrealised and day P&L are still computed from the
   current quote on every call. The EOD tables hold what a past day closed at.
5. **Its own tables, a switch and a thread**: `portfolio.performance.enabled` (a kill switch), its own scheduler thread, per-account
   try/catch, so a candle outage, a quota error or one bad day of data cannot touch the three routes or trading.
6. **A quota budget.** The 2000 requests a day are shared with the executor's poller. The job has a per-run cap on candle calls,
   stops on the first `429`, resumes next run, and makes **one candle call per symbol per range**, never per account.

### 3.1 Changes from the history plan (and why)

| History plan said | This plan does | Reason |
|---|---|---|
| Compute NAV in the **executor-service** | compute and read in the order-service's `portfolio` package | one module, one owner, in the Trade REST API as the story requires; the executor stays a settlement engine |
| Add the route to `trade-api.yaml` | new `portfolio-performance-api.yaml` | keeps the binding contract focused |
| `account_cash_flow` ledger now, back-filled with `OPENING` rows | **derive** the opening deposit: `opening = balance - sum(filled sells) + sum(filled buys)`; add the ledger only when a deposit feature exists | the platform has no deposits, so cash moves only by trades after the opening balance; no new write path in account creation, nothing to back-fill. Needs coherent sample data (6.3) |
| Replace **Positions** with **Portfolio** | one **Portfolio** page holding priced holdings (A), P&L, and later the curve (B); `/positions` redirects | the story asks for a "portfolio screen"; the redirect keeps the dashboard link working |
| New `getCandles` on the executor client | a method on the order-service's own Fauxnance client | no cross-service dependency |
| Curve starts at the first order | starts at the account's `opening_date`, flat at 1000 until the first trade | one rule for every account |
| Absolute P&L only for a range | also stores the **EOD statement** per day: value, cost basis, unrealised, cumulative realised, day P&L | the product owner wants EOD P&L kept (D11) |

### 3.2 The EOD statement

For each account and closed day `d` (one row in `portfolio_nav_daily`):

```
cash(d), holdingsValue(d) = sum(qty * close(d) * fx(d)), totalValue V(d) = cash + holdingsValue
costBasis(d)              = sum(qty * averageCost) replayed to the end of d
unrealisedPnl(d)          = holdingsValue(d) - costBasis(d)
realisedPnlCumulative(d)  = sum of ledger entries booked on or before d
netFlow F(d)              = the derived opening deposit on opening_date, otherwise 0
dayPnl(d)                 = V(d) - V(d-1) - F(d)             (trades swap cash for shares, so they cancel; only prices move it)
units U(d) and nav(d)     = the NAV rules of section 3.3
estimated                 = any synthetic, missing or forward-filled-over-a-gap price was used
```

Computed from stored daily closes, so it is deterministic and a past day never changes, except that the last 5 days are recomputed when a
synthetic candle is replaced by a real one.

### 3.3 NAV rules

`NAV(d0) = 1000`, `U(d0) = V(d0) / 1000` on the first day with value; a deposit on day `d` creates `F(d) / NAV(d-1)` units (a withdrawal
cancels them); every day `NAV(d) = V(d) / U(d)`. Returns, annualised return (shown over a year), max drawdown, best and worst day are
derived from the stored NAV. An empty account (value 0) pauses the curve and carries the last NAV (never a divide by zero).
CLOSED accounts and accounts with a derived opening of 0 are skipped.

Worked example the tests use: value 10,000 -> NAV 1,000, 10 units; add 5,000 -> 5 new units, 15 units, NAV still 1,000, no gain shown;
next day +1,000 -> value 16,000, NAV 1,066.67.

## 4. Track A design

### 4.1 Package layout (`services/order-service/src/main/java/org/example/backend/portfolio/`)

```
portfolio/
  README.md                      own README: purpose, routes, tables, config, failure behaviour, the user-id claim note
  controller/
    PortfolioController          GET /api/v1/portfolio/{accountId}  .../positions  .../pnl
    HealthController             GET /health   (no token; outside /api/**)
    PortfolioExceptionHandler    ACC-403, ACC-404, VAL-422, MKT-503 (the shared ApiExceptionHandler is untouched)
  service/
    PortfolioService             builds summary / positions / pnl from the pieces below
    PortfolioAccess              owner check; 403 ACC-403 + WARN log on mismatch; 404 ACC-404 for an unknown account
    PositionValuation            pure functions: costBasis, marketValue, unrealised, day P&L, percentages, rounding
  quote/
    QuoteSource                  interface: Map<String, Quote> fetch(Collection<String> symbols)
    FauxnanceBatchQuoteSource    own HttpClient, GET /quotes?symbols=A,B,C (<=25), short timeout, no retry loop
    QuoteCache                   TTL cache, single-flight, stale-while-error, back-off
    Quote                        symbol, price, currency, previousClose, asOf, stale
  ledger/
    RealisedPnlLedger            insert-if-absent, sum by account / date range / symbol
    AverageCostReplay            pure: replays fills with the executor's exact weighted-average rule
    RealisedPnlReconciler        startup + on-demand: books any filled SELL missing from the ledger
  consumer/
    FilledSellConsumer           trade-events, group "portfolio-pnl", handles ORDER_FILLED + SELL, ignores the rest
  config/                        Kafka (manual commit, DLT, poison messages dead-lettered), mapper scan, feature switch
  mapper/PortfolioMapper         + resources/mapper/PortfolioMapper.xml
  exceptions/                    PricingUnavailableException, PortfolioAccessDeniedException, InvalidDateRangeException
  dto/                           contract-shaped records
  performance/                   (Track B) CandleClient, CandleStore, NavCalculator, EodStatementService, NavJob, PerformanceController
```

### 4.2 The routes

| Route | Built from | Notes |
|---|---|---|
| `GET /api/v1/portfolio/{accountId}` | `getBalance` (cash), `getPositions` (qty, avg cost), `QuoteCache`, ledger sum | `partial` if any holding is unpriced; `asOf` = oldest `priceAsOf` used, or now; adds `dayPnl`, `dayPnlPercent` (extension) |
| `GET .../positions?symbol=` | the same, one row per open holding | contract-exact fields plus the day P&L extension; **no** name or icon: the UI merges them by `symbol` from the positions it already loads |
| `GET .../pnl?from&to&bySymbol` | ledger (realised, bounded by `from`/`to` on the booking date, UTC) + current valuation (unrealised, always now) | `from > to` is `422 VAL-422`; `bySymbol=true` adds `SymbolPnl`; adds `dayPnl` (extension) |
| `GET /health` | DB ping, last Fauxnance result, `/usage` at most every 10 minutes | always `200`; `status: degraded` when a dependency is |

### 4.3 Quotes: batching, caching, staleness

* One `QuoteCache` for the whole service. A request needs the symbols of one account; the cache serves what is fresh and asks Fauxnance
  **once** for the rest, up to 25 per call (`portfolio.quote.max-symbols-per-call=25`).
* `portfolio.quote.ttl-seconds=30`: a fresh quote is reused by every account and every refresh in that window.
* **Single-flight:** concurrent requests for the same missing symbols wait for one call.
* **Stale-while-error:** when a call fails (timeout, 5xx, `429` quota), the last good quote is **kept and served with `stale=true`** for up
  to `portfolio.quote.max-stale-hours=24`. A `429` also opens a back-off (`portfolio.quote.backoff-seconds=60`) so a quota problem is
  not hammered by every refresh.
* `priceAsOf` is the quote's own `asOf`. `stale` is true when **any** of these holds: the quote's own `stale` flag, its age beyond
  `portfolio.quote.fresh-seconds=300` (delayed quotes are normal), or it came from the stale-while-error cache.
* Cold start with Fauxnance down and nothing cached: every symbol unpriced -> `503 MKT-503`, the specified outcome.
* Optional later: its own consumer of `market-data` to warm the cache after a restart. Not `LatestQuoteStore`.

### 4.4 Currency

Cost basis and average cost are already in the account currency. A quote arrives in the **instrument's** currency (the quote's own
`currency`, else `instrument.currency`). The cache stores it as received; the valuation converts to the account currency with
`CurrencyConversionService.convert`. `baseCurrency` is the account's. **Decided (Q1): `lastPrice`, `marketValue`, `unrealisedPnl`,
`previousClose` and the day P&L are in the account currency; `currency` on a position stays the instrument's currency and is
informational.** This is recorded in `CONTRACT-CHANGES.md`.

* If a conversion cannot be done (`ExchangeRateUnavailableException`), that position is treated as unpriced for this response (stale,
  partial), never a 500, never an assumed 1:1.
* No conversion when the two currencies match, as elsewhere in the platform.

### 4.5 The arithmetic (per `portfolio-api.yaml`, all in the account currency)

```
costBasis      = quantity * averageCost
marketValue    = quantity * lastPrice                       (lastPrice converted to the account currency)
unrealisedPnl  = marketValue - costBasis                    (live, never stored)
unrealised %   = unrealisedPnl / costBasis * 100            (null when costBasis = 0), 2 dp
realisedPnl    = sum over booked sales of (fillPrice - averageCostAtSale) * quantitySold   (never recomputed from prices)
totalValue     = cashBalance + sum(marketValue)
```

Worked example the tests use: buy 10 @ 100, buy 10 @ 120 (average 110), sell 5 @ 130 -> realised `(130-110)*5 = 100`, quantity 15, average still
110. Tomorrow the price moves to 200: unrealised changes, **realised is still 100**. Rounding: money at 2 dp `HALF_UP`, matching the
executor; percentages at 2 dp.

**Partial answers** (decided, Q3: the contract literally): the unpriced position has null price fields and `stale=true`; the summary's
`marketValue` and `unrealisedPnl` are over the **priced** positions, `costBasis` is over **all** positions, `totalValue = cash + priced
market value`, `partial = true`. The identity `unrealised = marketValue - costBasis` therefore holds only when `partial=false`, and the UI
says so, because a stale valuation is never shown as live.

### 4.6 Day P&L (live, never stored)

The catalogue wants "profit and loss for the day", and the product owner wants the API to return it (Q2). The quote carries
`previousClose`, so:

```
position dayPnl     = quantity * (lastPrice - previousClose)           in the account currency, today's rate
position dayPnl %   = dayPnl / (quantity * previousClose) * 100
summary dayPnl      = sum over priced positions that have a previousClose; null when none has
summary dayPnl %    = summary dayPnl / sum(quantity * previousClose) * 100
```

Stated limits, written in the README: it is the move of what you hold **now** (a position bought today is measured from the previous close,
not from its fill), and the exchange rate is today's, not yesterday's. The exact version, which handles same-day trades and flows, is the
stored EOD `day_pnl` of Track B (`V(d) - V(d-1) - F(d)`), shown for closed days. `dayPnl` is null, not zero, when the data is not there.

## 5. Realised P&L: the ledger

### 5.1 Why a ledger, not just the event

The contract allows "computed from the sell orders in `orders`, or accumulated from `trade-events`". The story wants it **accumulated**. A
pure replay on every request is correct but recomputes; a pure event consumer is fragile (the event has no average cost; a consumer that
starts late misses history). So:

* **`realised_pnl_entry`** holds one row per filled sale, written once and never changed.
* The **consumer** (`FilledSellConsumer`) books sales as they happen.
* The **reconciler** books any filled sale that is missing (history before the consumer existed, a lost message, a restart) at startup and
  on demand for an account. Both use `ON CONFLICT (order_id) DO NOTHING`, so they can overlap harmlessly.

### 5.2 Booking one sale (`AverageCostReplay`)

1. Load the account's `FILLED` orders for that instrument, ordered by `transaction_date, order_id`.
2. Replay with the executor's rule: BUY -> `avg = (avg*qty + price*q) / (qty+q)` at scale 2 `HALF_UP` (from quantity 0 the average is just
   the price); SELL -> quantity decreases, **average unchanged**.
3. At the target sale, `averageCostAtSale` is the average *before* it; `realised = (fillPrice - averageCostAtSale) * quantity`.
4. Insert `(order_id, account_id, symbol, quantity, fill_price, average_cost_at_sale, realised_pnl, currency, booked_at)`.

Deterministic, so a late or replayed event gives the same row. If the replay quantity is *less* than the sale, the entry is **not** booked,
a `WARN` names the order, and the reconciler reports a count; it never guesses. (After section 6.3 this never happens for sample data.)

### 5.3 Date filters

`from`/`to` compare against `booked_at` (the order's `transaction_date`) as a **UTC date** (assumed, see section 12; documented in the
README and the contract note).

## 6. Database changes and the five files that move together

### 6.1 Tables

**Track A: `realised_pnl_entry`** (owned by the portfolio module)

```sql
CREATE TABLE IF NOT EXISTS realised_pnl_entry (
    order_id              BIGINT        PRIMARY KEY,                 -- the sale; the idempotency key
    account_id            INTEGER       NOT NULL,
    ticker_symbol         VARCHAR(20)   NOT NULL,
    quantity              BIGINT        NOT NULL,
    fill_price            NUMERIC(19,4) NOT NULL,
    average_cost_at_sale  NUMERIC(19,4) NOT NULL,
    realised_pnl          NUMERIC(19,4) NOT NULL,
    currency              CHAR(3)       NOT NULL,                    -- the account currency at booking
    booked_at             TIMESTAMPTZ   NOT NULL,                    -- the order's transaction_date
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_realised_pnl_account FOREIGN KEY (account_id) REFERENCES account(account_id) ON DELETE CASCADE,
    CONSTRAINT chk_realised_pnl_quantity CHECK (quantity > 0),
    CONSTRAINT chk_realised_pnl_currency CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX IF NOT EXISTS idx_realised_pnl_account_booked ON realised_pnl_entry(account_id, booked_at);
```

No foreign key to `orders` (the module must not couple its table to a trading table it only reads); `order_id` is the idempotency key. No live
price is stored: only the sale's own fill price and the cost at that sale, both facts of a past event.

**Track B** (a second schema file, so switching the feature off never leaves A half-applied)

```sql
CREATE TABLE IF NOT EXISTS price_candle_daily (            -- cache of Fauxnance daily candles, per symbol, shared by every account
    symbol VARCHAR(32) NOT NULL, candle_date DATE NOT NULL,
    close NUMERIC(19,6) NOT NULL, adjclose NUMERIC(19,6) NOT NULL,
    currency CHAR(3) NOT NULL, synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (symbol, candle_date));

CREATE TABLE IF NOT EXISTS portfolio_nav_daily (            -- the EOD statement of a CLOSED day; written once
    account_id INTEGER NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    nav_date DATE NOT NULL,
    cash NUMERIC(19,4) NOT NULL, holdings_value NUMERIC(19,4) NOT NULL, total_value NUMERIC(19,4) NOT NULL,
    cost_basis NUMERIC(19,4) NOT NULL, unrealised_pnl NUMERIC(19,4) NOT NULL,
    realised_pnl_cumulative NUMERIC(19,4) NOT NULL, net_flow NUMERIC(19,4) NOT NULL, day_pnl NUMERIC(19,4) NOT NULL,
    units NUMERIC(24,8) NOT NULL, nav NUMERIC(19,6) NOT NULL,
    estimated BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (account_id, nav_date));
```

`account_cash_flow` is **not** added (section 3.1).

### 6.2 Where each change goes (the checklist for every DB change)

| File | Change | Track |
|---|---|---|
| `services/order-service/src/main/resources/portfolio-schema.sql` (new) | `realised_pnl_entry`, idempotent | A |
| `services/order-service/src/main/resources/portfolio-performance-schema.sql` (new) | `price_candle_daily`, `portfolio_nav_daily`, idempotent | B |
| `.../application.properties` | add the schema files to `spring.sql.init.schema-locations`; add the `portfolio.*` settings (4.3, and `portfolio.performance.*`) | A, B |
| `databases/PostgreSQL/migrations/create_schema.sql` | a new section for each: a fresh database is complete in one run | A, B |
| `databases/PostgreSQL/migrations/sample_data.sql` | the reconciled sample data (6.3), still idempotent; **no hand-written ledger or EOD rows**: the reconciler and the job produce them, so the seed cannot drift from the orders | A |
| `databases/PostgreSQL/migrations/update_trading_db.sql` | regenerated: the new schema sections, the sample-data section, and the **seed-only reconciliation** block (6.3) so existing machines reach the same state | A, B |
| `databases/PostgreSQL/migrations/update_auth_db.sql` | **no change**: Portfolio touches only `trading_db`. Stated so nobody wonders | - |
| `databases/PostgreSQL/migrations/auth_setup.sql` | no change | - |
| `databases/PostgreSQL/tools/build_update_scripts.py` (new, moved out of the scratch folder) | the generator for the two update scripts; regenerate, never hand-edit | A |
| `UpdateScriptSyncTest.java` | add the new schema files to the list the update script must contain verbatim | A, B |
| `SeedDataConsistencyTest.java` + new `SeedPortfolioCoherenceTest.java` | the sample data is coherent (6.3) | A |
| `databases/README.md` | the new tables, the reconciliation rule, how to update | A, B |

### 6.3 Making the sample data make sense (Q7: every account, not one)

Today's sample orders, holdings and balances were written independently, so a holding is not the result of its orders and a balance is not
the result of its trades. The Portfolio module (replay, ledger, and Track B's derived opening deposit) needs them to agree. The audit and
rewrite covers **all ten sample accounts** (ids 1001 to 1010).

**Invariants** (each checked by `SeedPortfolioCoherenceTest`, which parses `sample_data.sql` the way `SeedDataConsistencyTest` does):

| # | Invariant |
|---|---|
| I1 | each holding row equals the replay of that account's `FILLED` orders (same quantity, same average to 2 dp with the executor's rule); a fully sold pair keeps a row at quantity 0, as the executor leaves it |
| I2 | no `FILLED` SELL exceeds what was held at that moment; no BUY is for more than the cash at that moment |
| I3 | every `FILLED`/`REJECTED`/`CANCELLED` order has a `transaction_date` not before its `received_at` and not in the future; `NEW` orders have none (the schema already requires this) |
| I4 | for ACTIVE and SUSPENDED accounts, `balance = opening - buys + sells`, where `opening` is a round figure of at least 20,000 (the platform minimum); `purchasing_power = balance` (what the executor writes) |
| I5 | CLOSED accounts have no holdings, balance 0 and no `NEW` orders |
| I6 | order and fill prices are in the **account currency** (the platform rule), using one stated illustrative exchange rate per currency pair in a comment at the top of the section; fill prices are taken from the **real Fauxnance closes** on those dates (looked up once in Track B phase B2 and written in as constants), so the NAV curve of a sample account looks sane |
| I7 | ids and idempotency keys are unique; seed order keys keep the existing `IDEMP-2026...` prefix, which is how the update script recognises seed orders |
| I8 | the ten accounts together demonstrate every UI state (below) |

**Scenarios** (assigned when the file is rewritten; one account each unless stated):

| State to demonstrate | Account type |
|---|---|
| realised **profit** | ACTIVE, one position partly sold above cost |
| realised **loss** | ACTIVE, one position sold below cost |
| only buys, nothing sold | ACTIVE |
| **multi-currency**: a USD account holding an INR stock; a EUR account holding a USD stock | ACTIVE |
| a fully sold position (quantity 0 row) | ACTIVE |
| an empty ACTIVE account (cash only) | ACTIVE |
| open `NEW` orders beside filled ones | ACTIVE |
| suspended | SUSPENDED, with holdings (it can still be priced and read) |
| closed | CLOSED, flat |

**Existing machines (the part that must not hurt anyone).** `sample_data.sql` is `ON CONFLICT DO NOTHING`, so existing rows would keep the
old, incoherent values. The update script therefore adds a **seed-only reconciliation** block that, per sample account, **first checks that
the account has no order whose key does not start with `IDEMP-2026`**:

* none -> the account is seed-only: its seed orders, holdings and balance are replaced by the coherent ones, and its ledger and EOD rows are
  cleared so they are rebuilt;
* any real order (someone placed one through the app, for example alice.trader's fills) -> the account is **left exactly as it is**, and a
  `NOTICE` says so. The replay will simply reflect the real history.

The block is the only place the update script deletes anything, it is limited to seed ids, and it is idempotent. Risk: balances and
holdings of seed-only accounts change, so any Playwright journey or spec that relies on a sample account's old figures is updated in the
same commit (listed in the phase A2 task).

## 7. Contracts and the generated client

| Item | Change |
|---|---|
| `contracts/portfolio-api.yaml` | copied from `leap-capstone-india-main/contracts/`. **Additive team extensions only, each marked "Team extension" in its description:** `PricedPosition.previousClose`, `dayPnl`, `dayPnlPercent`; `PortfolioSummary.dayPnl`, `dayPnlPercent`; `PnlResponse.dayPnl` (all nullable, none required, so existing clients are unaffected). A note on the price fields: they are in `baseCurrency` (Q1). Nothing else in the document changes |
| `contracts/CONTRACT-CHANGES.md` | an entry: the new module; `MKT-503` new to this repo's catalogue; the day P&L extension; the price-currency note; the user-id claim note (below) |
| `frontend/openapitools.json` | add `portfolio-api` -> `generated/portfolio`; `npm run api:generate`; commit the output. The services are **generated from the contract**, never hand-written |
| `frontend/src/app/api/portfolio-api.service.ts` (+spec) | the thin wrapper, like `NotificationsApi`; the app's only door to the client |
| `frontend/src/app/api/api.config.ts`, `api/README.md` | `providePortfolioApi`, base URL = same origin as the Trade API |
| Track B | `contracts/portfolio-performance-api.yaml` (new), generated as `generated/portfolio-performance`; routes: the curve with summary statistics and an optional benchmark, and a **daily statements** list (the EOD P&L history) |

The contract speaks of "the token's `accountId` claim". On this platform the token carries the **user id** and `account.user_id` links it to
the account; `CONTRACT-CHANGES.md` says so, so the comparison the contract asks for is made through that link.

## 8. Backend phases and tests

### Track A

| # | Work | Tests |
|---|---|---|
| A1 | Copy the contract with the marked extensions; wire `portfolio-api`; generate the client | `api:check` passes |
| A2 | `portfolio-schema.sql`, schema loader entry, `create_schema.sql`, the **reconciled `sample_data.sql`** (6.3), the seed-only reconciliation block, the regenerated update script and the generator tool; fix any spec or journey that used old sample figures | `UpdateScriptSyncTest`, `SeedDataConsistencyTest`, `SeedPortfolioCoherenceTest` |
| A3 | `AverageCostReplay`, `RealisedPnlLedger`, `RealisedPnlReconciler`, `FilledSellConsumer` + Kafka config | replay equals the executor on shared vectors; a sale books `(fill - avg) * qty`; a second delivery inserts nothing; the consumer ignores BUY, REJECTED, CANCELLED; a poison message is dead-lettered; the reconciler skips an unreconcilable sale and counts it |
| A4 | `QuoteSource`, `QuoteCache` (batch, TTL, single-flight, stale-while-error, back-off) | 10 holdings = 1 call, 30 = 2; a fresh hit makes no call; a failure serves stale; `429` backs off; cold start with failure -> nothing |
| A5 | `PositionValuation` (incl. day P&L), `PortfolioService`, controller, exception handler, `PortfolioAccess` | the worked example; zero cost basis -> null percent; multi-currency and an unconvertible currency; partial; all unpriced -> `MKT-503`; day P&L with and without `previousClose`; each route 403 for a foreign account (+ log) and 404 for an unknown one; `from > to` -> 422; `bySymbol` |
| A6 | `HealthController` | `200` with `degraded` when Fauxnance is down; no token needed; `/usage` rate-limited |
| A7 | Guards | `PortfolioIsReadOnlyTest` (mapper XML writes only the module's tables); architecture test (the trading write path and the other three modules import nothing from `portfolio`, and `portfolio` imports nothing from them); trading still works with Fauxnance stubbed down |
| A8 | `portfolio/README.md`, `BeanConstructorsTest` still passes; `docker-compose.yml`, `.env.example` and the IntelliJ run configuration get `FAUXNANCE_BASE_URL` / `FAUXNANCE_API_KEY` for the order-service | - |

### Track B (after A is done)

| # | Work |
|---|---|
| B1 | `portfolio-performance-schema.sql`; `create_schema.sql`, `update_trading_db.sql`, `UpdateScriptSyncTest`, `databases/README.md` as in 6.2 |
| B2 | `getCandles` on the order-service's Fauxnance client + parser tests (200, 202, 404, 429, `synthetic`, `mixed`); candle cache by symbol; one-off lookup of the real closes for the sample fills (I6) |
| B3 | `NavCalculator` (pure): derived opening flow, units, NAV, EOD statement fields; tests on the worked examples, an empty account, a withdrawal, a closed account skipped |
| B4 | Replay service: cash, quantity and cost basis per day from the fills; FX via `FX:` candles; forward-fill weekends and holidays; `estimated` on synthetic, missing or long-gap prices; flag a suspected split; cumulative realised from the ledger |
| B5 | Scheduler: nightly top-up, heal the last 5 days, on-demand "building" (`202`), per-run call budget, stop on `429`; `portfolio.performance.enabled` as the kill switch |
| B6 | `portfolio-performance-api.yaml`, routes (curve, summary statistics, daily statements, benchmark), owner check, tests |
| B7 | UI: the performance component and the daily-statements table (section 9) |
| B8 | Docs, commit guide |

## 9. Front end

### 9.1 Rules this build follows (from the project's Angular guidance)

* **TypeScript:** strict types, inference where obvious, no `any` (use `unknown`).
* **Angular:** components are standalone by default, and `standalone: true` is **never written**; `OnPush` is **not** set explicitly; signals
  for state; lazy-loaded feature routes; `input()` / `output()` / `model()`; `computed()` and `linkedSignal()` for derived state; no
  `@HostBinding` / `@HostListener` (the `host` object instead); no `ngClass` / `ngStyle` (class and style bindings); no `CommonModule`
  (import only the pipes and directives used); native control flow (`@if`, `@for`, `@switch`); `NgOptimizedImage` for static images; forms
  (the realised date filter) use **Signal Forms**; no `mutate`; no globals such as `new Date()` in templates (a computed or a helper).
* **Services:** `@Service`, `inject()`, single responsibility. API calls go through the **generated** `portfolio` client via
  `PortfolioApi`; no hand-written `HttpClient` calls.
* **Design:** `DESIGN_SYSTEM.md` and the existing shared components (`LineChart`, `DonutChart`, `Dropdown`, `Spinner`, `Tooltip`,
  `InstrumentLabel`, `Pagination`); **design tokens only**, no hardcoded colours or shadows; a new section is added to `DESIGN_SYSTEM.md`.
* **Accessibility:** WCAG AA contrast, focus order and management, ARIA where needed, and **axe must pass**. `package.json` has no axe
  dependency today, so a small shared spec helper on `axe-core` is added (the dependency install is for the user to run), and every new
  component spec calls it. The stale marker is an icon **plus** the word "Delayed", never colour alone; gains and losses carry a sign and an
  arrow, never colour alone.

### 9.2 Track A screens

| Change | Where |
|---|---|
| Wrapper and store: `PortfolioStore` (resource-based; refreshes every 60 s while the page is open, the server caches so it is cheap) and view-model helpers | `frontend/src/app/api/`, `core/` |
| **Portfolio page** at `/portfolio` (the sidebar's "Positions" becomes "Portfolio"; `/positions` redirects so the dashboard link survives) | `features/portfolio/`, `app.routes.ts`, `app.ts` |
| Summary tiles: Total value, Cash, Market value, Unrealised P&L (amount and %), Realised P&L, **Today's P&L** (amount and %) | page |
| Freshness line "Prices as of 14:05", a **Delayed** marker, and a **partial** notice ("2 holdings could not be priced, so totals are understated") | page |
| Priced holdings: the existing `PositionsCard` / `PositionsTable` gain Price, Market value, Unrealised, Today columns; the page joins `PricedPosition` with `PositionResponse` by `symbol` for name and icon | `features/positions/*` |
| **P&L breakdown** from `pnl?bySymbol=true`, with a realised date filter (Signal Form, validation for `from > to`) | page |
| **503 `MKT-503`**: degrade to the unpriced holdings the page already has, with a banner and a retry, never an empty page | page |
| States: loading, priced, partial, stale, 503, empty account, error; specs for each, axe on each, and a Playwright journey with the quote source stubbed down (credentials from env) | `*.spec.ts`, `e2e/` |

The dashboard keeps "Invested over time" (cost, no call) and gets a "View portfolio" link.

### 9.3 Track B screens

Built as `features/portfolio/portfolio-performance`, directly under the summary tiles. `PortfolioPerformance`: range buttons (1M, 3M, 6M, 1Y, All; `aria-pressed`), a percent-from-start curve re-based client-side, a benchmark
toggle, stat tiles (return, absolute P&L, annualised over a year, max drawdown, best and worst day), the shared `LineChart` extended
(several series, percent formatter, zoom, smooth lines), a **Daily statements** table (the stored EOD P&L: value, day P&L, cumulative
realised, unrealised), and the states building, too short, error, estimated and available-from. Tokens only; the chart is a labelled
image and the tiles and a one-sentence summary carry the numbers.

## 10. Failure containment (the story's "allowed to fail" requirement)

| Failure | What happens | What does not happen |
|---|---|---|
| Fauxnance down or `429` | stale quotes if any, else `503 MKT-503`; the UI shows unpriced holdings | no order is delayed or rejected; no 500 |
| Exchange rate down | that position is unpriced and the response is `partial` | no 500, no assumed rate |
| A bad `trade-events` message | dead-lettered, the consumer carries on | the group never blocks |
| The ledger consumer is down | the reconciler books the missing sales on the next read or restart | no sale is lost or booked twice |
| The EOD job fails (Track B) | logged, retried next run; a closed day is never half-written (one transaction per account-day) | the three routes are unaffected |
| Portfolio code throws | its own exception handler answers; the order write path is a different class tree | nothing in `TradeService` imports the module |

## 11. Commit plan (when building starts)

| # | Message |
|---|---|
| 1 | `feat(contracts): add the portfolio and P&L contract` |
| 2 | `feat(db): add the realised P&L ledger and reconcile the sample data` (schema, `create_schema.sql`, `sample_data.sql`, regenerated update script, generator, tests) |
| 3 | `feat(order-service): book realised profit and loss from filled sales` |
| 4 | `feat(order-service): add priced portfolio routes` (quotes, valuation, day P&L, controller, health) |
| 5 | `chore(dev): give the order-service the market data key` |
| 6 | `feat(frontend): generate the portfolio client and wrap it` |
| 7 | `feat(frontend): add the portfolio page with priced holdings and P&L` |
| 8 | `docs: describe the portfolio module` |
| B1 to B8 | one commit per Track B phase, behind `portfolio.performance.enabled` |

## 12. Decisions made, and what is still open

### Decision log

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| D1 | Price with the module's own batched Fauxnance client, behind a global cache | the story requires batching and caching; one call serves every account | per-position calls (10x the quota); reading the executor's cache over HTTP (couples the two services' availability) |
| D2 | Stale-while-error cache instead of reading `LatestQuoteStore` from `market-data` | keeps Portfolio independent of the watchlist module | `LatestQuoteStore` (an import from another module) |
| D3 | Realised P&L in a ledger filled by a consumer **and** a reconciler, booked from a deterministic replay | accumulates (AC4); survives a late consumer, a lost message and a replayed event | recompute from current prices (wrong by definition); event-only (no average cost in the event; history missed) |
| D4 | Cash, positions and rates read through `TradeService` / `CurrencyConversionService` in-process | "through the code that already owns them" | own SQL on `account` / `holdings` |
| D5 | An unconvertible currency makes that position unpriced (partial) | one missing rate must not take down the portfolio | fail the request; assume 1:1 (a silently wrong total) |
| D6 | **The trading tables are read-only from this module, and a test enforces it, not only review.** The module shares the service's database connection, so nothing at runtime stops a stray `UPDATE orders`. `PortfolioIsReadOnlyTest` scans the module's mapper XML and fails the build on any `INSERT`/`UPDATE`/`DELETE` aimed at a table the module does not own. Discipline and review remain, but a person is no longer the only control | the story names this as the point worth making | relying on review alone; a separate read-only database user (the better long-term answer, needs ops work, noted as a follow-up) |
| D7 | The priced route is contract-shaped, so name and icon are merged client-side by `symbol` | `additionalProperties:false` | adding presentation fields to the contract |
| D8 | `/health` always answers `200`; a failing dependency makes `status: degraded` | the contract; liveness must not flap on a vendor outage | `503` on a dependency failure |
| D9 | The token's claim is the **user id**; ownership is `account.user_id` for the path account; mismatch is `403 ACC-403` and logged, an unknown account `404 ACC-404` | the platform is a microservice, multi-database system: account ids are never in the JWT or in `auth_db`; `user_id` is the connector between `auth_db` and `trading_db`. The contract's wording is bridged in `CONTRACT-CHANGES.md` | reusing `assertUserCanAccessAccount` (answers 409); using `AuthContext.requiredAccountId` (it is the user id under a misleading name) |
| D10 | Track B (EOD statements and NAV) is approved, in the same package and service, sequenced after A, with its own contract, tables and a kill switch | more data from the same module; isolation protects the story | folding it into the portfolio contract; leaving it out |
| D11 | **Live P&L is never stored; EOD statements for closed days are** | the product owner's rule; a closed day is a historical fact, and it enables the NAV curve and a P&L history | storing live figures; storing nothing (no history) |
| D12 | Day P&L is served by the API from the quote's `previousClose` (live), as additive optional fields, and exactly (trade- and flow-aware) from the stored EOD `day_pnl` for closed days | the product owner wants it returned; the quote already carries `previousClose` | a UI-only estimate |
| D13 | Prices and values are in the **account currency**; `currency` stays the instrument's | unrealised P&L needs one currency; recorded in `CONTRACT-CHANGES.md` | prices in the instrument's currency (mixed-currency arithmetic) |
| D14 | The sample data is reconciled for **every** account, and the update script only rewrites **seed-only** accounts | the module needs orders, holdings and balances to agree; real orders on sample accounts must survive | reconciling only one account; overwriting accounts with real orders |
| D15 | The opening deposit is derived from orders and balance, not stored | no deposit feature exists; no new write path | an `account_cash_flow` ledger now |

### Answers received and how they are applied

| Question | Answer | Applied in |
|---|---|---|
| Q1 currency of `lastPrice` / `marketValue` | **Yes**: account currency, `currency` informational | 4.4, D13, `CONTRACT-CHANGES.md` |
| Q2 profit and loss for the day | the API should return it; live P&L is never stored, EOD P&L may be | 4.6, 3.2, D11, D12, R16 |
| Q3 `totalValue` when partial | the contract literally (understated, `partial=true`); no objection recorded | 4.5 |
| Q4 the `accountId` claim | the JWT carries only `user_id`; accounts exist only in `trading_db`; `user_id` links the two databases | 2, R3, D9 |
| Q6 Track B | welcome, inside the same service | section 3, D10 |
| Q7 sample data | make everything make sense, for every account | 6.3, D14 |

### Still open (none blocks Track A)

1. **`from` / `to` time zone** for realised P&L: the plan assumes the **UTC date** of the booking. Say so if another is wanted.
2. **Day P&L limits** (4.6): the live figure measures what you hold now from the previous close, at today's rate. Accept, or ask for the
   exact version to be the only one shown?
3. **Seed prices**: I6 takes sample fill prices from real Fauxnance closes, which needs the candle client (phase B2). Until then phase A2 uses
   plausible illustrative prices and the coherence test passes regardless; they are swapped in B2. Accept the two-step?
4. **Real orders on sample accounts** are left untouched by the update script (6.3); those accounts therefore show real, not curated,
   history. Accept?

## 13. Risks

| Risk | Mitigation |
|---|---|
| The replay's rounding differs from the executor's by a penny | shared test vectors from the executor's own tests; one place (`AverageCostReplay`) owns the rule |
| The quota is shared with the poller | the cache is global, one call per TTL; back-off on `429`; Track B has a per-run budget |
| A duplicate Fauxnance client drifts from the executor's | small and isolated, documented; a shared library is a later, separate change |
| The update script is hand-edited and drifts | the generator moves into the repo and `UpdateScriptSyncTest` fails on drift |
| Rewriting sample balances breaks a spec or journey that expected the old figures | A2 searches for and updates every use in the same commit |
| The seed-only reconciliation deletes something it should not | limited to seed ids and accounts with only `IDEMP-2026` orders; a `NOTICE` for every account it skips; idempotent; tested on a copy first |
| Splits distort Track B | flagged in v1, as the history plan accepts |
| The order-service now needs the Fauxnance key | compose, `.env.example` and the IntelliJ run configuration are updated in A8; the app starts without it and answers `MKT-503` |
| axe is not installed | the helper and the dependency are added with the first new component; the install is the user's step |

## 14. Definition of done

**Track A**

* Every row of section 1 has a passing test or a stated manual check, including the seven story paths.
* A foreign account gets `403 ACC-403` on all three routes and a log line; an unknown one `404 ACC-404`.
* With Fauxnance unreachable: orders still place, the portfolio answers stale numbers or `503 MKT-503`, and the UI shows unpriced holdings.
* Ten holdings cost one Fauxnance call per 30 seconds however many tabs are open.
* Realised P&L does not change when prices do; replaying an event changes nothing.
* A fresh database (`create_schema.sql` + `sample_data.sql`) and an existing one (`update_trading_db.sql`) end in the same state, and every
  sample account replays to its own holdings.
* The UI follows section 9.1 and axe passes on every new component.
* `portfolio/README.md`, `CONTRACT-CHANGES.md`, `DESIGN_SYSTEM.md`, `databases/README.md` and `COMMIT-GUIDE.md` are updated.

**Track B**

* A closed day's statement is written once and never changes (except the 5-day healing window); the job stops on `429` and resumes.
* The curve starts at 0% for every range; a deposit would not move it (tested on the worked example).
* With `portfolio.performance.enabled=false` nothing in Track A changes.
