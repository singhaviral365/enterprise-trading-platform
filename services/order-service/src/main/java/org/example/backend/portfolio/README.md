# Portfolio and P&L module

A customer can see what they hold, what it is worth now, and whether they are up or down: market value, cost basis, unrealised
and realised profit and loss, the day's profit and loss, and one total that includes cash. The Trade REST API returns positions
unpriced (a quantity and an average cost). Pricing needs a live quote, which is a third-party call with its own latency and
failure modes, so it does not belong inside the transaction that records a trade. This module prices on its own routes, reads
the same positions, and is allowed to fail without stopping anyone from trading.

Plan, decisions and the decision log: [`documentation/readme/PORTFOLIO_PLAN.md`](../../../../../../../../../documentation/readme/PORTFOLIO_PLAN.md).
Contract (binding): [`contracts/portfolio-api.yaml`](../../../../../../../../../contracts/portfolio-api.yaml), and what the platform team
added to it: [`contracts/CONTRACT-CHANGES.md`](../../../../../../../../../contracts/CONTRACT-CHANGES.md).

## Routes (all on the Trade REST API, port 8080)

| Route | Answers |
|---|---|
| `GET /api/v1/portfolio/{accountId}` | cash, market value, cost basis, unrealised and realised P&L, day P&L, total value, `partial`, `asOf` |
| `GET /api/v1/portfolio/{accountId}/positions[?symbol=]` | every open holding priced, with `priceAsOf` and `stale` |
| `GET /api/v1/portfolio/{accountId}/pnl[?from=&to=&bySymbol=]` | realised (bounded by the dates) and unrealised (always now) |
| `GET /api/v1/portfolio/{accountId}/realised[?from=&to=&bySymbol=]` | **realised profit and loss alone** (a team extension). It needs no price, so it never fails for want of one and is the only portfolio route that still answers while pricing is down |
| `GET /api/v1/portfolio/{accountId}/performance[?from=&to=&benchmark=]` | **the closed-day history and NAV curve** (team contract `portfolio-performance-api.yaml`): stored statements only, never a vendor call; `202` `building` the first time; `PRF-503` when switched off |
| `GET /health` | postgres and fauxnance status; always `200`, `degraded` when a dependency is; no token |

Every route compares the authenticated user with the account in the path **before it reads anything**:
`403 ACC-403` (logged) for someone else's account, `404 ACC-404` for one that does not exist. The token carries the **user id**
(account ids are never in the JWT or in `auth_db`); `account.user_id` links the user to the account, and that link is the check.
`AuthContext.requiredAccountId` is **not** used: it is the user id under a misleading name.

## Packages

| Package | Holds |
|---|---|
| `controller` | `PortfolioController`, `HealthController`, `PortfolioExceptionHandler` (ACC-403, ACC-404, VAL-422, MKT-503) |
| `service` | `PortfolioService`, `PortfolioAccess` (the ownership check), `PositionValuation` (the arithmetic, as pure functions), `PortfolioHealth` |
| `quote` | `QuoteCache` (batch, TTL, single flight, stale-while-error, back-off), `FauxnanceBatchQuoteSource`, `Quote`, `ObservedQuote` |
| `ledger` | `RealisedPnlLedger`, `AverageCostReplay`, `RealisedPnlReconciler`, `StartupReconciliation` |
| `consumer` | `FilledSellConsumer` (group `portfolio-pnl`, topic `trade-events`) |
| `performance` | the history: `FauxnanceCandleSource`, `CandleStore`, `CandleBudget`, `HistoryReplay`, `NavCalculator`, `EodStatementService`, `NavJob`, `PerformanceService`, `PerformanceController` (see below) |
| `mapper`, `model`, `dto`, `config`, `exceptions` | MyBatis (`resources/mapper/PortfolioMapper.xml`), records, the contract's shapes, Kafka and mapper wiring |

## Definitions (from the contract)

```
costBasis      = quantity * averageCost
marketValue    = quantity * lastPrice
unrealisedPnl  = marketValue - costBasis                       (live, never stored)
realisedPnl    = sum of (fillPrice - averageCostAtSale) * quantitySold   (booked at the sale, never recomputed)
totalValue     = cashBalance + sum(marketValue)
dayPnl         = quantity * (lastPrice - previousClose)         (live, never stored; platform addition)
```

Money is in the **account currency**: cost basis and average cost already are, and a quote in the instrument's currency is
converted with `CurrencyConversionService` before it is used. A position whose price cannot be converted counts as not priced.
`PricedPosition.currency` stays the instrument's own currency and is informational. Rounding is 2 places, `HALF_UP`, like the executor.

**Day P&L** measures the move of what is held *now* from the previous close, at today's exchange rate (a position bought today is
measured from the previous close, not from its fill). It is `null`, never zero, when the previous close is not known.

## Pricing, caching and staleness

* **One batched call, not one per holding.** The `QuoteCache` serves what is fresh and asks Fauxnance once for the rest, at most 25
  symbols per call (`portfolio.quote.max-symbols-per-call`). Ten holdings are one call; thirty are two. A quote is reused for
  `portfolio.quote.ttl-seconds` (30) by every account and every refresh, and concurrent requests wait for one call instead of
  making their own. A symbol Fauxnance does not know is asked about once per window.
* **Stale is a state, not an error.** `priceAsOf` is the quote's own `asOf`. `stale` is true when Fauxnance flags the quote stale,
  when it is older than `portfolio.quote.fresh-seconds` (300), or when it is the last good quote kept because a refresh failed
  (kept up to `portfolio.quote.max-stale-hours`, 24). The number is served and marked; it is never hidden.
* **A quota error (429)** opens a back-off (`portfolio.quote.backoff-seconds`, 60), so a refresh loop cannot hammer the vendor.
* **Unavailable.** Every held instrument unpriced: `503 MKT-503` (the UI falls back to the unpriced holdings it already has).
  Some unpriced: `200`, the price omitted on those positions, `stale: true`, and `partial: true` on the summary. The summary's
  market value and unrealised P&L are over the *priced* positions, the cost basis over *all*, so the identity
  `unrealised = marketValue - costBasis` holds only when `partial` is false.
* **The key stays server-side.** `FAUXNANCE_BASE_URL` and `FAUXNANCE_API_KEY` are environment values of the order-service. No route
  returns them, the browser never calls Fauxnance, and error messages never contain the URL or the key. Without them the module
  starts and answers `MKT-503`.

## Realised profit and loss: the ledger

Table **`realised_pnl_entry`** (`portfolio-schema.sql`), one row per filled sale, keyed by `order_id`. A sale is booked once and
never changes; nothing about today's price reaches it.

* `FilledSellConsumer` reads `trade-events` in its own group and books each filled sale. The offset is committed once the sale is
  durably booked. A replayed event finds nothing left to book, so **the realised total cannot be double-counted**.
* **A holding the orders do not explain** (seeded, or from before orders were recorded) is not dropped. What the filled orders do not
  account for was held at the start (the *opening position*), and its cost is the one that makes the replay end at the average the
  `holdings` row shows (a sale never changes the average, so this can be worked backwards, by search over cents with the very same replay).
  Selling it is booked like any other sale. Where the cost cannot be pinned down (the position went through zero) the holding's own
  average stands in for it.
* The event does not carry the average cost at the sale. `AverageCostReplay` replays the account's filled orders with the
  executor's exact rule (a buy sets `(avg*qty + price*q) / newQty` at scale 2 `HALF_UP`, a sell never changes the average), so
  the answer depends only on the orders and a late event gives the same row as a prompt one.
* `RealisedPnlReconciler` books any sale that is missing (history from before the module, a lost message): at start-up, and for one
  account whenever its portfolio is read. A sale that nothing supports (it comes before anything was held, in the order things
  happened, or the holding is smaller than the orders imply) is **not booked and is logged**; it never guesses a cost.

## Performance: closed-day statements and the NAV curve

An account's absolute profit, or its plain value, says little about how it performed: a deposit looks like a gain. The curve treats the
account like a fund: a pool of units whose price is the **NAV** (1000 on the first day). Money put in or taken out only creates or cancels
units, so only the market moves the NAV. Only **closed days** are stored; live figures never are.

* **Starting point.** The platform has no deposits, so cash only moves by trades after the opening balance, which is therefore derived
  exactly: `balance now - sells + buys`. A holding the orders do not explain is an opening position, found the way the ledger finds it
  (`AverageCostReplay.deriveOpening`). The first day's whole value is the funding. Orders that imply a negative opening balance build no history (logged).
* **Valuing a day.** `HistoryReplay` replays the filled orders day by day (cash and the executor's weighted-average lots). Each holding
  is valued at that day's raw `close`, filled forward over weekends and holidays, converted with that day's `FX:{FROM}{TO}` candle (direct,
  else inverted, else today's rate). The day is `estimated` when a close was synthetic or missing (carried at cost), more than
  five days old, or a rate was today's.
* **NAV** (`NavCalculator`): `units += F / NAV(previous day)`, `NAV = V / units`, `dayPnl = V(d) - V(d-1) - F(d)`. A trade swaps cash for shares and cancels; a price move does not.
* **Candles** (`CandleStore`): the daily closes are cached in `price_candle_daily` and fetched once for the whole range, then only the new days.
  `CandleBudget` caps the calls per run and stops on the first `429` (the shared daily quota). `FauxnanceCandleSource` makes one attempt per
  call and never puts the URL or key in a message.
* **Writing** (`EodStatementService`): new days are written; days already written are left alone, except the last `heal-days`, which are rewritten.
* **When.** `NavJob` runs nightly (`portfolio.performance.cron`, UTC) for every account that is not closed; the first request for an account
  with no history starts one build in the background (single flight) and answers `202`. The route itself reads stored rows only.
* **Benchmark.** Any symbol in `portfolio.performance.benchmarks` (default `SPY`): its `adjclose` rebased to 1000 on the curve's first day. Another symbol is `VAL-422`.
* **Off switch.** `portfolio.performance.enabled=false` stops the job and answers `PRF-503`; nothing else in this module changes.

Tables (`portfolio-performance-schema.sql`): `price_candle_daily` (shared closes) and `portfolio_nav_daily` (one statement per account per closed day).

## Read-only, and how that is enforced

The module shares the database connection the order path uses, so nothing at runtime stops a stray `UPDATE orders`. It reads the
trading tables through the code that owns them (`TradeService.getPositions` / `getBalance`, `InstrumentMapper`,
`CurrencyConversionService`) and writes **only** its own tables (`realised_pnl_entry`, `price_candle_daily`, `portfolio_nav_daily`). `PortfolioIsReadOnlyTest` scans the mapper XML and the
module's Java and fails the build on any other write. `PortfolioIndependenceTest` fails it if the module imports notifications,
preferences or watchlist, or if anything outside it imports the module: a pricing outage answers on these routes and leaves order
placement alone.

## Configuration

| Property | Default | Meaning |
|---|---|---|
| `portfolio.quote.base-url`, `portfolio.quote.api-key` | from `FAUXNANCE_BASE_URL`, `FAUXNANCE_API_KEY` | the quote service; empty means `MKT-503` |
| `portfolio.quote.request-timeout-millis` | `3000` | one attempt per call, no retry loop (the cache serves the last good quote instead) |
| `portfolio.quote.max-symbols-per-call` | `25` | the vendor's limit |
| `portfolio.quote.ttl-seconds` | `30` | how long a quote is reused |
| `portfolio.quote.fresh-seconds` | `300` | older than this is marked stale |
| `portfolio.quote.max-stale-hours` | `24` | how long the last good quote may be served after refreshes fail |
| `portfolio.quote.backoff-seconds` | `60` | pause after a quota error |
| `portfolio.kafka.*` | group `portfolio-pnl`, topic `trade-events`, `earliest` | the ledger consumer; `portfolio.kafka.consumer.enabled=false` switches it off |
| `portfolio.reconcile.on-startup` | `true` | book missing sales when the application is ready |
| `portfolio.performance.enabled` | `true` | the nightly job and the performance route; off answers `PRF-503` |
| `portfolio.performance.cron` | `0 30 1 * * *` | when the nightly job runs (UTC), after the last close |
| `portfolio.performance.max-candle-calls-per-run` | `60` | the most Fauxnance candle calls one run may spend; it also stops on the first `429` |
| `portfolio.performance.heal-days` | `5` | how many of the latest days are rewritten, so a synthetic candle later replaced by a real one heals |
| `portfolio.performance.benchmarks` | `SPY` | symbols a client may compare with |

## Known limits

* The live Day P&L is the estimate described above. The exact, trade- and flow-aware day figure is the stored `dayPnl` of each closed day (performance route).
* `from` / `to` on the P&L route are compared with the sale's booking time as **UTC dates**.
* The sample data is not reconciled yet. A sample holding that was never bought through an order is handled as an opening position
  (above), so selling it is booked, but its cost is the holding's average, not a recorded purchase.
* The quote cache is in memory (one instance, like the quote store of the watchlist module): after a restart with Fauxnance down
  there is nothing to serve stale, and the answer is `MKT-503`.
