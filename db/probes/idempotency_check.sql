-- ============================================================
-- Probe: Idempotency Key Constraint Validation
-- ============================================================

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
    'PROBE-DUPLICATE-IDEMPOTENCY-001',
    'RECEIVED',
    'BUY',
    100.0000,
    10,
    1001,
    2001
);

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
    'PROBE-DUPLICATE-IDEMPOTENCY-001',
    'RECEIVED',
    'BUY',
    100.0000,
    10,
    1001,
    2001
);
