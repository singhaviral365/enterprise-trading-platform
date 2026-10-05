# README — PostgreSQL Trading Database Constraints

## 1. Overview

This database is designed for a trading platform and uses Primary Keys, Foreign Keys, Unique Constraints, NOT NULL constraints, DEFAULT values, and CHECK constraints to maintain data integrity.

Main tables:
1. advisor
2. client
3. account
4. instrument
5. orders
6. holdings

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
