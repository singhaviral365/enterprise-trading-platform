# Index Justifications

## Overview

Indexes were selected based on the named business queries provided in the Sprint 3 specification.

The purpose of each index is to support a specific query pattern rather than to add indexes speculatively. This is particularly important for the `orders` table because orders are expected to be written frequently. Every additional index increases the cost of `INSERT` operations and of `UPDATE` operations that modify indexed columns.

The indexes below were evaluated using `EXPLAIN ANALYZE`. Existing primary-key and unique-constraint indexes were considered before creating additional indexes.

The final design contains four additional indexes:

1. `idx_orders_account_status_received_at`
2. `idx_orders_account_received_at`
3. `idx_orders_received_at`
4. `idx_account_customer_reference`

---

# Query 1 – All Open Orders for One Account

## Business requirement

Return all open orders for one account, newest first.

## Query

```sql
SELECT
    o.order_id,
    o.account_id,
    o.instrument_id,
    o.order_status,
    o.order_type,
    o.price,
    o.quantity,
    o.received_at
FROM orders o
WHERE o.account_id = 1001
  AND o.order_status = 'NEW'
ORDER BY o.received_at DESC;
```

## Index

```sql
CREATE INDEX idx_orders_account_status_received_at
ON orders (account_id, order_status, received_at DESC);
```

## Without the index

Without an index covering the account and order status, PostgreSQL may need to scan a large portion of the `orders` table to find orders belonging to the requested account and having an open status.

It may then need to sort the matching rows by `received_at`.

Typical plan shape:

```text
Seq Scan on orders
  Filter: ((account_id = 1001) AND (order_status = 'NEW'))

Sort
  Sort Key: received_at DESC
```

## With the index

The index first groups rows by `account_id`, then by `order_status`, and finally by `received_at DESC`.

This allows PostgreSQL to identify the requested account and status efficiently while reading the matching rows in the required order.

Typical plan shape:

```text
Index Scan using idx_orders_account_status_received_at
  Index Cond:
    (account_id = 1001)
    AND (order_status = 'NEW')
```

This avoids scanning unrelated accounts and can avoid a separate sort.

## Write cost

The index must be maintained when an order is inserted.

It also creates maintenance overhead when `account_id`, `order_status`, or `received_at` changes.

The cost is justified because Query 1 is a dashboard/blotter query and is expected to execute frequently.

---

# Query 2 – Last 50 Orders for One Account

## Business requirement

Return the most recent 50 orders for one account, regardless of order state.

## Query

```sql
SELECT
    o.order_id,
    o.account_id,
    o.instrument_id,
    o.order_status,
    o.order_type,
    o.price,
    o.quantity,
    o.received_at
FROM orders o
WHERE o.account_id = 1001
ORDER BY o.received_at DESC
LIMIT 50;
```

## Index

```sql
CREATE INDEX idx_orders_account_received_at
ON orders (account_id, received_at DESC);
```

## Without the index

Without an index beginning with `account_id`, PostgreSQL may perform a sequential scan of the `orders` table to locate all orders belonging to the requested account.

It may then sort those rows by `received_at DESC` before applying the `LIMIT`.

Typical plan shape:

```text
Seq Scan on orders
  Filter: (account_id = 1001)

Sort
  Sort Key: received_at DESC

Limit
```

## With the index

The index groups orders by account and stores `received_at` in descending order.

PostgreSQL can therefore locate the requested account and read the newest orders first. Because the query only needs 50 rows, PostgreSQL can stop reading once the required rows have been found.

Typical plan shape:

```text
Limit
  -> Index Scan using idx_orders_account_received_at
       Index Cond: (account_id = 1001)
```

This is particularly useful because the query is expected to run frequently when displaying order history.

## Write cost

Every inserted order requires an additional index entry.

Updates to `account_id` or `received_at` also require index maintenance.

The write cost is justified because the index directly supports a common account-history query and allows PostgreSQL to stop after finding the newest 50 rows.

---

# Query 3 – Current Holdings for One Account

## Business requirement

Return everything currently held by an account, including quantity and average cost.

## Query

```sql
SELECT
    h.holding_id,
    h.account_id,
    i.instrument_ticker,
    i.instrument_name,
    h.quantity,
    h.purchase_price
FROM holdings h
JOIN instrument i
    ON h.instrument_id = i.instrument_id
WHERE h.account_id = 1001;
```

## Index decision

No additional index is required.

The schema declares a unique constraint on:

```sql
(account_id, instrument_id)
```

PostgreSQL automatically creates a unique B-tree index to enforce that constraint.

Because `account_id` is the first column of the index, PostgreSQL can use the existing index to locate holdings belonging to a particular account.

The existing index therefore supports:

```sql
WHERE h.account_id = 1001
```

without requiring a duplicate index.

## Plan evidence

The existing index can be investigated with:

```sql
EXPLAIN ANALYZE
SELECT
    h.holding_id,
    h.account_id,
    i.instrument_ticker,
    i.instrument_name,
    h.quantity,
    h.purchase_price
FROM holdings h
JOIN instrument i
    ON h.instrument_id = i.instrument_id
WHERE h.account_id = 1001;
```

The existing indexes can also be inspected using:

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'holdings';
```

No additional index was created because doing so would duplicate an access path already provided by the unique constraint.

This avoids unnecessary write and storage overhead.

---

# Query 4 – Orders Created Since a Given Timestamp

## Business requirement

Return every order created since a specified timestamp, across all accounts.

## Query

```sql
SELECT
    o.order_id,
    o.account_id,
    o.instrument_id,
    o.order_status,
    o.order_type,
    o.price,
    o.quantity,
    o.received_at
FROM orders o
WHERE o.received_at >= TIMESTAMP '2026-01-01 00:00:00'
ORDER BY o.received_at;
```

## Index

```sql
CREATE INDEX idx_orders_received_at
ON orders (received_at);
```

## Without the index

Without an index on `received_at`, PostgreSQL may need to perform a sequential scan of the entire `orders` table to identify orders created after the specified timestamp.

Typical plan shape:

```text
Seq Scan on orders
  Filter: (received_at >= ...)
```

As the number of orders grows, scanning the entire table becomes increasingly expensive.

## With the index

The B-tree index allows PostgreSQL to seek directly to the first `received_at` value satisfying the timestamp condition.

Typical plan shape:

```text
Index Scan using idx_orders_received_at
  Index Cond: (received_at >= ...)
```

The index is especially useful for the nightly analytical extract because the query operates across all accounts but restricts the data using a timestamp.

## Write cost

Each new order requires an entry in the index.

Updates to `received_at` also require index maintenance.

The additional write cost is justified because the timestamp query is required for incremental extraction and becomes increasingly valuable as the order history grows.

---

# Query 5 – Resolve an Account from the Customer-Facing Reference

## Business requirement

Resolve an account using the customer-facing reference quoted by support staff or supplied during authentication.

## Query

```sql
SELECT
    a.account_id,
    a.client_id,
    a.opening_date,
    a.balance,
    a.purchasing_power,
    a.account_status,
    a.currency
FROM account a
WHERE a.customer_reference = 'ACC-1001';
```

## Index

```sql
CREATE UNIQUE INDEX idx_account_customer_reference
ON account (customer_reference);
```

## Without the index

Without an index on `customer_reference`, PostgreSQL may perform a sequential scan of the `account` table to find the requested account.

Typical plan shape:

```text
Seq Scan on account
  Filter: (customer_reference = 'ACC-1001')
```

## With the index

The index allows PostgreSQL to locate the account directly using the customer-facing reference.

Typical plan shape:

```text
Index Scan using idx_account_customer_reference
  Index Cond: (customer_reference = 'ACC-1001')
```

The index is declared as `UNIQUE` because a customer-facing account reference identifies one account and must not be duplicated.

## Write cost

The index must be maintained when an account is inserted.

If the customer-facing reference is changed, the corresponding index entry must also be updated.

The additional cost is justified because account resolution is a frequent lookup used by support and authentication services.

---

# Query 6 – Filled Orders with Running Cash Total and Rank

## Business requirement

For one account, return filled orders oldest first, together with:

* the running total of cash committed;
* the rank of each order by value within its instrument.

## Query

```sql
SELECT
    o.order_id,
    o.account_id,
    o.instrument_id,
    o.quantity,
    o.price,
    o.quantity * o.price AS order_value,

    SUM(o.quantity * o.price) OVER (
        PARTITION BY o.account_id
        ORDER BY o.received_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_cash_committed,

    RANK() OVER (
        PARTITION BY o.instrument_id
        ORDER BY (o.quantity * o.price) DESC
    ) AS value_rank

FROM orders o
WHERE o.account_id = 1001
  AND o.order_status = 'FILLED'

ORDER BY o.received_at;
```

## Index decision

No index was created specifically for Query 6.

The purpose of this query is to demonstrate the use of window functions to calculate derived values such as running totals and rankings.

The query is therefore kept as a query-design example rather than being used as justification for another index.

The assignment specifically states that Query 6 earns no index justification.

---

# Final Index Decisions

The following four indexes were added specifically to support the named queries:

```sql
CREATE INDEX idx_orders_account_status_received_at
ON orders (account_id, order_status, received_at DESC);

CREATE INDEX idx_orders_account_received_at
ON orders (account_id, received_at DESC);

CREATE INDEX idx_orders_received_at
ON orders (received_at);

CREATE UNIQUE INDEX idx_account_customer_reference
ON account (customer_reference);
```

The indexes support:

| Index                                               | Query   | Purpose                                         |
| --------------------------------------------------- | ------- | ----------------------------------------------- |
| `idx_orders_account_status_received_at`             | Query 1 | Find open orders for an account, newest first   |
| `idx_orders_account_received_at`                    | Query 2 | Find the newest 50 orders for an account        |
| Existing unique `(account_id, instrument_id)` index | Query 3 | Find holdings for an account                    |
| `idx_orders_received_at`                            | Query 4 | Find orders created since a timestamp           |
| `idx_account_customer_reference`                    | Query 5 | Resolve an account by customer-facing reference |

No additional index was created for Query 3 because the existing unique constraint already provides an index beginning with `account_id`.

No additional index was created for Query 6 because the query is intended to demonstrate window functions rather than justify an index.

All additional indexes introduce storage and write-maintenance costs. They are therefore tied directly to the required business queries rather than being added solely because the columns appear frequently in `WHERE` clauses.

