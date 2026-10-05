# Historical Trade Data Design

## 1. Purpose

The trading database currently stores orders and current holdings.

An order represents the lifecycle of a client trading request:

- RECEIVED
- FILLED
- CANCELLED
- REJECTED

For historical reporting, an executed trade needs to remain available as an immutable historical record even after the operational order has moved through its lifecycle.

The historical trade design is therefore intended to preserve executed trade information independently from the current operational state of an order.

This document is a design for the historical trade data required by Sprint 7. It does not introduce or implement a historical-trade table in Sprint 3.

---

## 2. What Is Retained

For every successfully executed order, the historical trade record should retain the information required to reconstruct the execution without depending on mutable operational data.

The retained information is:

| Attribute | Purpose |
|---|---|
| trade_id | Unique identifier for the historical execution |
| order_id | Links the execution back to the originating order |
| account_id | Identifies the account that executed the trade |
| instrument_id | Identifies the instrument traded |
| execution_timestamp | Time at which the trade was executed |
| quantity | Number of units executed |
| execution_price | Price at which the units were executed |
| order_type | Original order type, e.g. MARKET or LIMIT |
| source_received_at | Time at which the original order was received |

The historical record should be treated as immutable after insertion.

The execution price and execution quantity must be retained in the historical record rather than being recalculated later from the current order or holding.

This prevents historical reporting from changing when current operational data changes.

---

## 3. Retention Grain

The grain of the historical data is:

> One row represents one completed execution/fill.

For the current Sprint 3 order model there is no HALF_FILLED or PARTIALLY_FILLED state.

Therefore, the initial implementation can create one historical trade record when an order reaches FILLED.

If a future version of the execution system supports partial fills, each individual execution should become a separate historical trade record while retaining the originating order_id.

For example:

Order 3002
    |
    +-- Execution 1
    |
    +-- Execution 2

would result in two historical records if the execution system later supports multiple fills.

This keeps the historical data at execution grain rather than order grain.

---

## 4. Population

A historical trade record should be created only after an order has been successfully executed.

The logical flow is:

    Client
       |
       v
    Trade REST API
       |
       v
    Order
       |
       v
    Execution
       |
       +----> Order status = FILLED
       |
       +----> Historical trade record

The execution/trading component is responsible for creating the historical trade record as part of the successful execution transaction.

The historical record should contain the execution values produced by the execution process.

The operation should be atomic:

1. Execute the order.
2. Persist the execution result.
3. Mark the order as FILLED.
4. Persist the historical trade record.

If the transaction fails, the historical trade record must not be created independently of the successful execution.

This prevents historical records from existing for trades that were never actually executed.

---

## 5. Relationship With Existing Orders

The existing `orders` table remains the operational source for the order lifecycle.

The historical trade data has a different purpose.

`orders` answers:

> What happened to the order?

Historical trades answer:

> What execution actually occurred?

The historical record should therefore reference the originating order using `order_id`.

The account and instrument identifiers should also be retained in the historical record.

This allows historical extraction to avoid repeatedly resolving the full operational relationship:

    order -> account
    order -> instrument

for every historical query.

The historical data should not be used to represent current holdings.

Current holdings remain represented by the existing `holdings` table.

---

## 6. Incremental Extraction for Sprint 7

Sprint 7 should not scan the complete historical trade table for every extraction.

Instead, extraction should use a watermark.

The preferred approach is an increasing `trade_id` together with the execution timestamp.

The extraction process maintains the last successfully exported trade_id.

For example:

    Last successful trade_id = 500000

The next extraction can retrieve:

    WHERE trade_id > 500000

and process the results in ascending trade_id order.

Conceptually:

    SELECT ...
    FROM historical_trade
    WHERE trade_id > :last_trade_id
    ORDER BY trade_id;

After the extraction succeeds, the new maximum trade_id becomes the next watermark.

The watermark must only advance after the corresponding extraction has completed successfully.

This prevents records from being skipped if an extraction fails part way through.

---

## 7. Why Incremental Extraction Is Required

A full historical scan becomes increasingly expensive as the number of trades grows.

For example:

    10,000 historical trades
        |
        v
    Full scan is inexpensive

    1,000,000 historical trades
        |
        v
    Full scan becomes unnecessarily expensive

    100,000,000 historical trades
        |
        v
    Full scan becomes operationally unacceptable

With incremental extraction, if only 5,000 new trades have arrived since the previous extraction, the extraction reads the new range rather than the entire history.

The primary index supporting this access pattern should therefore be based on the incremental extraction key.

---

## 8. Indexing Strategy

The historical trade table should have a primary key on `trade_id`.

The primary key provides the natural ordering and supports incremental extraction by trade_id.

If the Sprint 7 workload also requires frequent time-range reporting, an index on `execution_timestamp` should be considered.

The design should avoid creating indexes solely because they might be useful.

Every additional index has a write cost because each historical trade insert must update the index.

Therefore:

- `trade_id` primary key is required.
- An execution timestamp index should only be added if the Sprint 7 workload demonstrates a real time-range access pattern.

---

## 9. Behaviour at 100x Volume

The design should remain usable if historical trade volume grows by approximately 100 times.

At higher volume:

1. Incremental extraction prevents full-table scans.
2. The trade_id primary key allows efficient range access.
3. Queries should always use bounded predicates where possible.
4. Historical data should remain append-oriented and immutable.
5. Operational queries should not depend on scanning historical data.

For example, moving from:

    1 million trades

to:

    100 million trades

should not require changing the extraction algorithm.

The extraction still uses:

    trade_id > last_successful_trade_id

rather than scanning all historical trades.

At very high volume, database statistics and index maintenance should be monitored.

---

## 10. Partitioning

Partitioning is not required for the initial Sprint 3 implementation.

At the current scale, a normal PostgreSQL table with an appropriate primary key and incremental extraction strategy is simpler and easier to operate.

If historical trade volume grows substantially, range partitioning by execution date/month should be considered.

For example:

    historical_trade_2026_08
    historical_trade_2026_09
    historical_trade_2026_10

Date-based partitioning would provide operational benefits for very large historical datasets, particularly for:

- time-range queries
- archival
- deletion of very old data
- maintenance of recent partitions

Partitioning should therefore be introduced only when measured data volume and workload justify the additional operational complexity.

---

## 11. Archival

Historical trades should not be deleted merely because they are no longer operationally active.

The historical data is intended to provide an audit and reporting record.

If a retention policy requires older records to leave the primary database, they should be archived rather than silently deleted.

A possible future approach is:

    Primary PostgreSQL database
              |
              | older than retention threshold
              v
          Archive storage

The archive process must preserve the original trade information and provide a way to retrieve historical records when required.

Archival should be implemented only when the business retention requirement and data volume justify it.

---

## 12. Retention

The retention period should be controlled by the application's/business retention policy rather than hard-coded into the database design.

The database design therefore supports:

- indefinite retention while volume is manageable
- archival of older records
- eventual deletion only when permitted by the applicable retention policy

The historical record should never be removed simply because the originating account is closed or the instrument is retired.

An account being CLOSED or an instrument being RETIRED does not invalidate historical trades.

---

## 13. Write Cost and Operational Complexity

The main advantage of this design is efficient historical reads and incremental extraction.

The costs are:

- additional storage
- an additional write for every successful execution
- maintenance of the historical table's indexes
- operational complexity for future archival/partitioning
- possible additional monitoring requirements

The design intentionally keeps the initial number of indexes small.

The primary trade-off is:

    More indexes
        |
        +--> faster reads
        |
        +--> more storage
        |
        +--> more work on inserts

Since historical trades are expected to be append-heavy, unnecessary indexes should be avoided.

---

## 14. Failure and Consistency Considerations

Historical trade creation must be transactionally consistent with successful execution.

The system must avoid:

    Execution fails
        |
        v
    Historical trade exists

It must also avoid:

    Execution succeeds
        |
        v
    Historical trade is silently missing

The preferred approach is to persist the execution result and historical trade record in the same database transaction as the successful order state transition.

The extraction process is separate from population.

Extraction failures must not alter or delete historical trade records.

The watermark must only advance after successful extraction.

---

## 15. Final Design Decision

For Sprint 7, the recommended design is:

- Historical data is retained at execution/fill grain.
- One row represents one executed trade.
- Historical records are immutable.
- `order_id`, `account_id`, and `instrument_id` are retained.
- Execution timestamp, quantity and execution price are stored as execution facts.
- Historical trades are populated by the execution/trading component after successful execution.
- Incremental extraction uses an increasing `trade_id` watermark.
- The primary key supports incremental extraction.
- Additional indexes are added only when justified by actual Sprint 7 queries.
- Partitioning is not required initially.
- Date-based partitioning can be introduced at substantially higher volume.
- Older data may be archived according to the business retention policy.
- Closed accounts and retired instruments do not cause historical trades to be deleted.
- The design is append-oriented and optimized for historical reads and incremental extraction.