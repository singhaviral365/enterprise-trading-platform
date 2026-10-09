# Watchlist module

Customer watchlists with a live price beside each instrument, and a price alert on any entry. A fired alert is handed
to the [customer notifications module](../notifications/README.md); this module never chooses a channel. The behaviour
(what "crossed" means, why an alert fires once, what happens when the hand-over fails) is in
[`documentation/readme/NOTIFICATIONS.md`](../../../../../../../../../documentation/readme/NOTIFICATIONS.md).

Contract: [`contracts/watchlist-api.yaml`](../../../../../../../../../contracts/watchlist-api.yaml).


## Where each part lives

The module and its consumer live in the Trade REST API, which is `services/order-service` (port 8081 locally),
in this package. `services/executor-service` does one thing for it: it makes sure watched instruments are **published** to `market-data`.

| Part | Where | What it does |
|---|---|---|
| Watchlist routes, tables, access control | order-service, this package | Customer-facing CRUD |
| `market-data` consumer, group `watchlist-prices` | order-service, `consumer/` | Keeps the latest quote per symbol in memory |
| Publishing watched instruments to `market-data` | executor-service, `MarketDataPoller` | Adds every symbol on a watchlist to the symbols it prices and publishes |

```
customer adds AAPL to a watchlist -> watchlist_item row
Executor poller (every ~60s): held symbols + open-order symbols + WATCHLIST symbols
          -> Fauxnance (batched) -> Kafka `market-data`
Trade API: MarketDataQuoteConsumer -> LatestQuoteStore (memory only)
GET /api/v1/accounts/{accountId}/watchlists -> items + latest price -> Angular
```

**Prices are never stored.** There is no price column, no quote table, and no cache in the database.
The only copy is the in-memory `LatestQuoteStore`, and a restart starts it empty.
`WatchlistPricesAreNotStoredTest` fails if a price column, a quote table or a price-bearing mapper
method is ever added.

## order-service half (this package)

| Package | Holds |
|---|---|
| `controller` | `WatchlistController`, `WatchlistExceptionHandler` (this module's error mapping) |
| `service` | `WatchlistService`: every use case, and the access check |
| `mapper` | `WatchlistMapper` (MyBatis; SQL in `resources/mapper/WatchlistMapper.xml`). No price access |
| `model` | `Watchlist`, `WatchlistItem` |
| `dto` | Request and response records |
| `exceptions` | Module errors, each with a catalogue code |
| `price` | `LatestQuoteStore` (in memory), `QuoteSource` (interface), `WatchlistPricing`, `Quote`, `PriceView`, `PriceStatus` |
| `consumer` | `MarketDataQuoteConsumer` |
| `alert` | Price alerts: `PriceAlertIndex` (in-memory, by symbol), `PriceAlertEvaluator` (the per-quote check), `PriceAlertFiring` (fire once, hand over), `PriceAlertRedelivery` (bounded retry), `PriceAlertIndexLoader` |
| `config` | Kafka consumer wiring (`WatchlistKafkaConfiguration`) and the mapper scan |

Nothing outside the package imports anything inside it. It reuses `AuthContext`, `ErrorResponse`,
`DomainException`, `AccountMapper` and `InstrumentNotFoundException` from the platform.

`WatchlistService` depends on the `QuoteSource` interface only, never on Kafka. `LatestQuoteStore` is
its one implementation.

### What the consumer does per message

Every quote for every symbol arrives here, so the per-message decision has to be cheap. It is a single
hash lookup and compare in memory (`LatestQuoteStore.offer`), then a second hash lookup by symbol for alerts
(`PriceAlertIndex.candidates`): no database and no network on the hot path unless a quote actually crosses a level. A replayed or out-of-order quote cannot move a price backwards, and the store is bounded
(`watchlist.price.max-symbols`).

The consumer holds no token and touches no customer data, only the in-memory store, so there is no
per-request authorisation on that path.

### Kafka settings

| Setting | Value |
|---|---|
| Topic | `market-data` only. Never `orders` or `trade-events` |
| Consumer group | `watchlist-prices` (`watchlist.kafka.consumer-group`). Never reuse `executor-service` or another module's group |
| Start position | `earliest` for a new group, then resumes from its committed offsets |
| Failures | Retried with backoff (`watchlist.kafka.consumer.retry.*`), then published to `market-data.DLT`. A malformed message is dead-lettered at once |
| Switch | `watchlist.kafka.consumer.enabled=false` starts the API without the consumer (used in tests) |

**Scaling.** The store is per instance. All instances sharing one group id split `market-data`'s
partitions between them, so each would hold only some symbols. Run **one** order-service instance
for this module, or give each instance its own group id so each reads every quote.

After a restart the store is empty until each symbol's next quote arrives (about one poll interval),
and those prices show as `UNAVAILABLE` until then.

## executor-service half

The only change is in `MarketDataPoller`. Besides held symbols and symbols on open orders, it now also
reads the instruments that appear on any watchlist
(`InstrumentMapper.selectWatchlistSymbolsForMarketPolling`: a join from `instrument` to
`watchlist_item`) and prices them with the rest, in the same batched Fauxnance calls.

That lookup is its own statement, wrapped so that if the watchlist tables do not exist yet the poller
logs a warning and carries on pricing held and open-order symbols. It never breaks order pricing.

## Tables

Created by order-service from `src/main/resources/watchlist-schema.sql` (loaded after
`schema.sql`, idempotent). The executor runs with `spring.sql.init.mode=never`.

| Table | Written by | Read by |
|---|---|---|
| `watchlist` | API | API |
| `watchlist_item` | API | API; executor (poller symbols) |

`watchlist_item` references `instrument`, not `holdings`, so a customer can watch something they have
never traded. **No table holds a market price.** A price alert adds columns to `watchlist_item` (`alert_direction`,
`alert_target_price`, `alert_status`, `alert_set_at`, `alert_triggered_at`, `alert_trigger_price`, `alert_delivery`,
`alert_delivery_attempts`), set and cleared together (`chk_watchlist_item_alert_shape`). The two price-valued ones are
the customer's own threshold and the single quote that crossed it, written once when the alert fires; the guard test
`WatchlistPricesAreNotStoredTest` names exactly those two and still rejects any other price or quote storage.

## Configuration (order-service, `application.properties`)

| Property | Default | Meaning |
|---|---|---|
| `watchlist.kafka.market-data-topic` | `market-data` | Topic to read |
| `watchlist.kafka.consumer-group` | `watchlist-prices` | This module's consumer group |
| `watchlist.kafka.consumer.enabled` | `true` | Start the consumer |
| `watchlist.kafka.consumer.retry.*` | 3 attempts, 100ms to 1s | Backoff before dead-lettering |
| `watchlist.limits.max-watchlists-per-account` | `10` | Cap per account |
| `watchlist.limits.max-items-per-watchlist` | `50` | Cap per watchlist |
| `watchlist.limits.max-alerts-per-account` | `20` | Cap on ACTIVE price alerts per account |
| `watchlist.alerts.redelivery-interval-millis` | `60000` | How often fired alerts that failed to hand over are retried |
| `watchlist.alerts.max-delivery-attempts` | `3` | Hand-over attempts per fired alert, then it stays `FAILED` and visible |
| `watchlist.price.stale-after-seconds` | `300` | Age after which a price is `STALE` |
| `watchlist.price.max-symbols` | `5000` | Bound on the in-memory store |

## Authorisation

Every service method starts with the account check. The user in the verified token must own the
addressed account, or the call is `ACC-403`. Every query after that is scoped to that account. A
watchlist id belonging to another account is reported as `WTL-404`, the same as one that does not
exist.

## Errors

See the table in the contract. This module's own codes are `WTL-404/409/422` and `WLI-404/409/422`;
they are mapped by `WatchlistExceptionHandler`, so the shared `ApiExceptionHandler` is untouched. Price alerts add
`ALR-404` (no alert on the entry), `ALR-409` (the target has already been reached) and `ALR-422` (the alert cap), served by
`PriceAlertController`.

## Tests

- API: `./mvnw test -Dtest='org.example.backend.watchlist.**.*Test'` in `services/order-service`.
- Executor: `./mvnw test` in `services/executor-service` (the poller tests cover watched symbols).

The mapper integration test needs Docker (Testcontainers) and is skipped without it. No test here
runs the poller, Kafka and the consumer together against a real broker.
