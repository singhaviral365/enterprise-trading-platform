-- ============================================================
-- Probe: Foreign Key Constraint Validation
-- ============================================================

-- ------------------------------------------------------------
-- 1. Test invalid account_id foreign key
-- Expected result: FAIL
-- Reason: account_id 1001 does not exist
-- ------------------------------------------------------------

INSERT INTO orders
(
    idempotency_key,
    order_status,
    order_type,
    price,
    quantity,
    account_id,
    instrument_id
)
VALUES
(
    'PROBE-FK-INVALID-ACCOUNT-001',
    'RECEIVED',
    'BUY',
    100.0000,
    10,
    999999,
    2001
);

-- ------------------------------------------------------------
-- 2. Test invalid instrument_id foreign key
-- Expected result: FAIL
-- Reason: instrument_id 1001 does not exist
-- ------------------------------------------------------------

INSERT INTO orders
(
    idempotency_key,
    order_status,
    order_type,
    price,
    quantity,
    account_id,
    instrument_id
)
VALUES
(
    'PROBE-FK-INVALID-INSTRUMENT-001',
    'RECEIVED',
    'BUY',
    100.0000,
    10,
    1001,
    999999
);