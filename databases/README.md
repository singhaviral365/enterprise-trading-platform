# README — PostgreSQL Trading Database Constraints

## 0. Creating the databases (the files to run)

Two databases, both created by these files under `databases/PostgreSQL/`:

| File | What it does |
|---|---|
| `schema.sql` | Creates `trading_db` if it does not exist, then all tables of its two schemas, `trading` and `auth`. A psql script (it uses `\connect` and `\ir`). |
| `seed_data.sql` | Loads the sample data into both. A psql script. |
| `trading/schema.sql`, `trading/seed_data.sql` | The same for `trading_db` alone, as plain SQL: run them in pgAdmin's Query Tool on that database. |
| `migrations/auth/schema.sql`, `migrations/auth/seed_data.sql` | The same for the `auth` schema alone. |

```bash
psql -h <host> -U <user> -d postgres -f databases/PostgreSQL/schema.sql
psql -h <host> -U <user> -d postgres -f databases/PostgreSQL/seed_data.sql
# or:  bash scripts/setup-db.sh        (reads the host, port, user and password from config/application.yml)
```

In pgAdmin, which cannot run psql commands: create the empty database (`CREATE DATABASE trading_db;`), then run
`migrations/trading/schema.sql`, `migrations/auth/schema.sql`, `migrations/trading/seed_data.sql` and `migrations/auth/seed_data.sql` on it.

The schema files are for **empty** databases (running one twice stops with "already exists"); the services also create anything missing when
they start. `SchemaParityTest` fails the build if the order-service's own start-up scripts ever define a table or column that
`trading/schema.sql` lacks. With docker compose none of this is typed: the two database containers load these files the first time they start.

**Sample data.** Ten advisors, ten customers with their accounts, thirteen instruments, ten orders and holdings, ten preference rows and four
strategies in `trading_db`; ten users (ids 1000 to 1009) in the `auth` schema. Every sample user signs in with the password `Sample@12345`
(stored only as an Argon2id hash) and has two-step sign-in off. This is sample data: change or delete those users before a real deployment.

---

## 1. Overview

This database is designed for a trading platform and uses Primary Keys, Foreign Keys, Unique Constraints, NOT NULL constraints, DEFAULT values, and CHECK constraints to maintain data integrity.

Main tables:
1. advisor
2. client
3. account
4. instrument
5. orders
6. holdings
7. customer_preference
8. strategy and strategy_run (automated strategies: the rule, the customer's limits, and the trail of what each one did; the lifecycle
   trigger refuses to leave a final status and to claim anything that is not ACTIVE)

---

## 2. Constraint Categories

| Constraint Type | Purpose |
|---|---|
| PRIMARY KEY (PK) | Uniquely identifies every row in a table |
| FOREIGN KEY (FK) | Ensures a referenced record exists in another table |
| UNIQUE | Prevents duplicate values |
| NOT NULL | Ensures a required field cannot be empty |
| CHECK | Ensures values satisfy a business rule |
| DEFAULT | Provides a value automatically when none is supplied |
| IDENTITY | Automatically generates numeric IDs |

---

## 3. Table: advisor

### Primary Key
| Constraint | Column | Description |
|---|---|---|
| pk_advisor | advisor_id | Uniquely identifies each advisor |

### Other Constraints
| Column | Constraint |
|---|---|
| advisor_id | PRIMARY KEY |
| advisor_name | NOT NULL |
| email | NOT NULL |
| password_hash | NOT NULL |
| hire_date | NOT NULL |

Relationship: One advisor can advise multiple clients.

---

## 4. Table: client

### Primary Key
| Constraint | Column |
|---|---|
| pk_client | client_id |

### Foreign Key
| Constraint | Column | References | Purpose |
|---|---|---|---|
| fk_client_advisor | advisor_id | advisor(advisor_id) | Ensures the assigned advisor exists |

### Check Constraints
| Constraint | Column | Rule |
|---|---|---|
| chk_client_risk_profile | risk_profile | CONSERVATIVE, MODERATE, or AGGRESSIVE |
| chk_client_join_date | join_date | Must satisfy the defined date rule |
| chk_client_date_of_birth | date_of_birth | Must satisfy the defined DOB rule |

---

## 5. Table: account

### Primary Key
| Constraint | Column |
|---|---|
| pk_account | account_id |

### Unique Constraint
| Constraint | Column | Purpose |
|---|---|---|
| uq_account_number | account_number | Prevents duplicate account numbers |

### Foreign Key
| Constraint | Column | References | Delete Rule |
|---|---|---|---|
| fk_account_client | client_id | client(client_id) | ON DELETE RESTRICT |

### Check Constraints

#### Account Status
```sql
CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
```

Only three account states are permitted: ACTIVE, SUSPENDED, CLOSED.

#### Account Balance
```sql
CHECK (balance >= 0.0000)
```

#### Purchasing Power
```sql
CHECK (purchasing_power >= 0.0000)
```

#### Currency
```sql
CHECK (currency ~ '^[A-Z]{3}$')
```

Currency must contain exactly three uppercase letters.

#### Version
```sql
CHECK (version >= 1)
```

#### Opening Date
```sql
CHECK (opening_date <= CURRENT_DATE)
```

#### Account Number
```sql
CHECK (account_number ~ '^[A-Z0-9]{12}$')
```

Account numbers must contain exactly 12 uppercase letters or digits.

#### Suspension State
```sql
CHECK (
    (account_status = 'SUSPENDED' AND suspended_at IS NOT NULL)
    OR
    (account_status <> 'SUSPENDED' AND suspended_at IS NULL)
)
```

#### Closure State
```sql
CHECK (
    (account_status = 'CLOSED' AND closed_at IS NOT NULL)
    OR
    (account_status <> 'CLOSED' AND closed_at IS NULL)
)
```

---

## 6. Table: instrument

### Primary Key
| Constraint | Column |
|---|---|
| pk_instrument | instrument_id |

### Check Constraints

#### Asset Class
Allowed values:
- EQUITY
- BOND
- ETF
- FUND

#### Instrument Status
Allowed values:
- TRADING
- HALTED
- RETIRED

---

## 7. Table: orders

### Primary Key
| Constraint | Column |
|---|---|
| pk_orders | order_id |

### Unique Constraint
| Constraint | Column | Purpose |
|---|---|---|
| uq_orders_idempotency_key | idempotency_key | Prevents duplicate order requests |

A duplicate idempotency key should fail with SQLSTATE `23505` (`unique_violation`).

### Foreign Keys
| Constraint | Column | References |
|---|---|---|
| fk_orders_account | account_id | account(account_id) |
| fk_orders_instrument | instrument_id | instrument(instrument_id) |

### Check Constraints

#### Order Side
```sql
CHECK (order_side IN ('BUY', 'SELL'))
```

Only BUY and SELL are allowed.

#### Order Status
Allowed values:
- RECEIVED
- FILLED
- REJECTED
- CANCELLED

#### Quantity
```sql
CHECK (quantity > 0)
```

#### Price
```sql
CHECK (price > 0)
```

---

## 8. Table: holdings

### Primary Key
| Constraint | Column |
|---|---|
| pk_holdings | holding_id |

### Foreign Keys
| Constraint | Column | References |
|---|---|---|
| fk_holdings_account | account_id | account(account_id) |
| fk_holdings_instrument | instrument_id | instrument(instrument_id) |

### Check Constraints

#### Quantity
```sql
CHECK (quantity > 0)
```

#### Purchase Price
```sql
CHECK (purchase_price >= 0)
```

---


## 9. Table: customer_preference

One row per account, created the first time the customer saves their settings. **No row means "all defaults"**: the Trade
API answers with them, so nothing has to be seeded for the module to work. It holds switches and display choices only; no
email address or phone number is stored here.

| Constraint | Column | Rule |
|---|---|---|
| pk (account_id) | account_id | One row per account |
| fk_customer_preference_account | account_id | References account(account_id), ON DELETE CASCADE |
| chk_customer_preference_currency | preferred_currency | Three capital letters. Kept equal to `account.currency`; saving a different one converts the account (see CURRENCY.md) |
| chk_customer_preference_date_format | date_format | DD_MM_YYYY, MM_DD_YYYY, DD_MONTH_YYYY, DD_MON_YYYY, YYYY_MM_DD, MON_DD_YYYY |
| chk_customer_preference_time_format | time_format | H12 or H24 |
| chk_customer_preference_number_format | number_format | US or IN |
| chk_customer_preference_theme | theme | LIGHT, DARK or SYSTEM |
| chk_customer_preference_landing_page | landing_page | DASHBOARD, MARKET, POSITIONS or ORDERS |
| chk_customer_preference_order_type | default_order_type | MARKET or LIMIT |

Channels (`channel_sms`, `channel_email`, `channel_in_app`) and categories (`notify_order_status`,
`notify_watchlist_alerts`, `notify_strategy_execution`) are one boolean column each. All three channels false means "No notifications".

The table comes from `trading/schema.sql` and its sample rows from `trading/seed_data.sql`. The order-service also runs
`preferences-schema.sql` (the same idempotent statements) every time it starts. How to create the databases is in section 0.

**The email in `auth.users` and `trading.account` must be the same for the same user.** The databases cannot enforce
that, so both seeds come from one list (sample account `1001` is user `1000`, and so on) and `SeedDataConsistencyTest` fails
the build if they drift. To check a running pair by eye, list the users and the accounts and compare:

```sql
-- in schema auth                                   -- in schema trading
SELECT user_id, email FROM users                SELECT user_id, email, phone_no FROM account
WHERE user_id BETWEEN 1000 AND 1009             WHERE user_id BETWEEN 1000 AND 1009
ORDER BY user_id;                               ORDER BY user_id;
```

---

## 9a. Portfolio tables: realised_pnl_entry, price_candle_daily, portfolio_nav_daily

Written only by the Portfolio module of the order-service (`PortfolioIsReadOnlyTest` fails the build on any other write). They hold **facts
of the past** and nothing live: market value, unrealised and day profit and loss as at now are computed from the current quote on every
request and are never stored. Created by the startup schema (`portfolio-schema.sql`, `portfolio-performance-schema.sql`), by
`trading/schema.sql` (a new database).

**realised_pnl_entry**: one row per filled sale, written once, never changed.

| Constraint | Column | Rule |
|---|---|---|
| pk | order_id | The sale; booking the same sale twice is a no-op (idempotency key) |
| fk_realised_pnl_account | account_id | References account(account_id), ON DELETE CASCADE |
| chk_realised_pnl_quantity | quantity | Greater than 0 |
| chk_realised_pnl_currency | currency | Three upper-case letters (the account currency when booked) |
| idx_realised_pnl_account_booked | account_id, booked_at | Serves the date-bounded realised figure |

`average_cost_at_sale` is the weighted average just before that sale (a fact of that moment); `realised_pnl = (fill_price - average_cost_at_sale) x quantity`.

**price_candle_daily**: a cache of the daily closes Fauxnance published, shared by every account (one row per symbol per trading day,
FX pairs as `FX:EURUSD`).

| Constraint | Column | Rule |
|---|---|---|
| pk | symbol, candle_date | One close per symbol per day |
| chk_price_candle_close, chk_price_candle_adjclose | close, adjclose | Greater than 0 |

`close` is the price as traded (holdings are valued with it, so share counts are never restated); `adjclose` is restated for splits and
dividends (benchmark returns use it); `synthetic` marks a row Fauxnance generated to bridge a gap, which makes the day it is used on estimated.

**portfolio_nav_daily**: the statement of one **closed** day of one account, in the account currency.

| Constraint | Column | Rule |
|---|---|---|
| pk | account_id, nav_date | One statement per account per day |
| fk_portfolio_nav_account | account_id | References account(account_id), ON DELETE CASCADE |
| chk_portfolio_nav_positive | nav, units | nav greater than 0, units 0 or more |

`total_value = cash + holdings_value`; `day_pnl = V(d) - V(d-1) - net_flow(d)`; `nav = total_value / units`, 1000 on the first day. Written once,
except the last few days (`portfolio.performance.heal-days`), which are rewritten so a synthetic candle later replaced by a real one heals.

## 9. Primary Key Summary

| Table | Primary Key | Purpose |
|---|---|---|
| advisor | advisor_id | Identifies advisor |
| client | client_id | Identifies client |
| account | account_id | Identifies account |
| instrument | instrument_id | Identifies instrument |
| orders | order_id | Identifies order |
| holdings | holding_id | Identifies holding |

---

## 10. Foreign Key Summary

| Table | Foreign Key | Parent Table | Relationship |
|---|---|---|---|
| client | advisor_id | advisor | Client is assigned to advisor |
| account | client_id | client | Account belongs to client |
| orders | account_id | account | Order belongs to account |
| orders | instrument_id | instrument | Order is for an instrument |
| holdings | account_id | account | Holding belongs to account |
| holdings | instrument_id | instrument | Holding represents an instrument |

Overall relationship:

```text
Advisor
   |
   +-- Client
          |
          +-- Account
                 |
                 +-- Orders ------ Instrument
                 |
                 +-- Holdings ---- Instrument
```

---

## 11. Unique Constraint Summary

| Table | Constraint | Column | Purpose |
|---|---|---|---|
| account | uq_account_number | account_number | Account number must be unique |
| orders | uq_orders_idempotency_key | idempotency_key | Prevents duplicate order requests |

---

## 12. NOT NULL Constraints

### Account
- account_number
- opening_date
- balance
- purchasing_power
- account_status
- currency
- version
- client_id

### Client
- client_name
- email
- password_hash
- phone_no
- date_of_birth
- join_date
- risk_profile
- advisor_id

### Order
- idempotency_key
- order_status
- received_at
- order_side
- price
- quantity
- account_id
- instrument_id

### Holding
- account_id
- instrument_id

---

## 13. Default Constraints

### Account
```sql
balance DEFAULT 0.0000
purchasing_power DEFAULT 0.0000
account_status DEFAULT 'ACTIVE'
version DEFAULT 1
```

---

## 14. Referential Integrity

Foreign keys prevent orphan records.

An order cannot reference an account or instrument that does not exist. PostgreSQL should return SQLSTATE `23503` (`foreign_key_violation`) for an invalid foreign-key reference.

For the account-to-client relationship, `ON DELETE RESTRICT` prevents deletion of a client while an account still references that client.

---

## 15. Idempotency Rule

The `orders.idempotency_key` column is unique.

Example:
- First request with `ORDER-001` -> succeeds.
- Second request with `ORDER-001` -> fails.

Expected SQLSTATE:

```text
23505
```

---

## 17. Overall Database Integrity

```text
DATABASE INTEGRITY
       |
       +-- ENTITY INTEGRITY
       |      +-- Primary Keys
       |      +-- NOT NULL
       |      +-- IDENTITY
       |
       +-- REFERENTIAL INTEGRITY
       |      +-- Foreign Keys
       |      +-- ON DELETE RESTRICT
       |
       +-- BUSINESS INTEGRITY
              +-- CHECK constraints
              +-- UNIQUE constraints
              +-- DEFAULT values
```

The combination of these constraints ensures that the trading database maintains valid relationships, prevents duplicate critical identifiers, and enforces important account and trading business rules directly at the database level.
