BEGIN;

-- ============================================================
-- 1. ADVISOR - 10 rows
-- ============================================================

INSERT INTO advisor
(
    advisor_id,
    advisor_name,
    email,
    password_hash,
    hire_date
)
VALUES
(1, 'Sarah Johnson',
 'sarah.johnson@broker.example',
 '$2b$12$examplehash001',
 '2018-05-14'),

(2, 'Michael Brown',
 'michael.brown@broker.example',
 '$2b$12$examplehash002',
 '2020-03-09'),

(3, 'Emma Wilson',
 'emma.wilson@broker.example',
 '$2b$12$examplehash003',
 '2021-11-22'),

(4, 'Daniel Murphy',
 'daniel.murphy@broker.example',
 '$2b$12$examplehash004',
 '2019-02-11'),

(5, 'Emily Davis',
 'emily.davis@broker.example',
 '$2b$12$examplehash005',
 '2019-09-23'),

(6, 'Robert Miller',
 'robert.miller@broker.example',
 '$2b$12$examplehash006',
 '2020-07-06'),

(7, 'Grace Wilson',
 'grace.wilson@broker.example',
 '$2b$12$examplehash007',
 '2021-01-18'),

(8, 'Thomas Moore',
 'thomas.moore@broker.example',
 '$2b$12$examplehash008',
 '2021-05-31'),

(9, 'Charlotte Clark',
 'charlotte.clark@broker.example',
 '$2b$12$examplehash009',
 '2022-09-12'),

(10, 'William Lewis',
 'william.lewis@broker.example',
 '$2b$12$examplehash010',
 '2023-03-20');


-- ============================================================
-- 2. ACCOUNT - 10 rows
-- ============================================================
-- user_id is independent and has no foreign key reference.
-- user_id values start from 1000 and increment by 1.
-- ============================================================

INSERT INTO account
(
    account_id,
    account_number,
    user_id,
    opening_date,
    balance,
    purchasing_power,
    account_status,
    currency,
    version,
    suspended_at,
    closed_at
)
VALUES
(
    1001,
    'ACC000001001',
    1000,
    '2022-01-10',
    25000.0000,
    18000.0000,
    'ACTIVE',
    'EUR',
    7,
    NULL,
    NULL
),

(
    1002,
    'ACC000001002',
    1001,
    '2022-04-15',
    15000.0000,
    12000.0000,
    'SUSPENDED',
    'EUR',
    3,
    '2026-08-20 09:30:00+01',
    NULL
),

(
    1003,
    'ACC000001003',
    1002,
    '2023-02-01',
    0.0000,
    0.0000,
    'CLOSED',
    'GBP',
    12,
    NULL,
    '2026-06-30 16:15:00+01'
),

(
    1004,
    'ACC000001004',
    1003,
    '2023-06-12',
    42000.0000,
    35000.0000,
    'ACTIVE',
    'USD',
    5,
    NULL,
    NULL
),

(
    1005,
    'ACC000001005',
    1004,
    '2024-02-12',
    18000.0000,
    15000.0000,
    'ACTIVE',
    'EUR',
    4,
    NULL,
    NULL
),

(
    1006,
    'ACC000001006',
    1005,
    '2024-05-08',
    32500.0000,
    25000.0000,
    'ACTIVE',
    'USD',
    6,
    NULL,
    NULL
),

(
    1007,
    'ACC000001007',
    1006,
    '2024-07-19',
    9500.0000,
    7000.0000,
    'SUSPENDED',
    'GBP',
    8,
    '2026-08-18 10:20:00+01',
    NULL
),

(
    1008,
    'ACC000001008',
    1007,
    '2025-01-15',
    0.0000,
    0.0000,
    'CLOSED',
    'EUR',
    11,
    NULL,
    '2026-05-14 15:30:00+01'
),

(
    1009,
    'ACC000001009',
    1008,
    '2025-04-21',
    27500.0000,
    21000.0000,
    'ACTIVE',
    'EUR',
    3,
    NULL,
    NULL
),

(
    1010,
    'ACC000001010',
    1009,
    '2025-07-10',
    61500.0000,
    50000.0000,
    'ACTIVE',
    'USD',
    9,
    NULL,
    NULL
);


-- ============================================================
-- 3. INSTRUMENT - 13 rows
-- ============================================================
-- Includes TRADING, HALTED and RETIRED.
-- ============================================================

INSERT INTO instrument
(
    instrument_id,
    instrument_ticker,
    instrument_name,
    asset_class,
    instrument_status,
    currency,
    icon_url
)
VALUES
(2001,
 'AAPL',
 'Apple Inc.',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/AAPL.svg'),

(2002,
 'MSFT',
 'Microsoft Corporation',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/MSFT.svg'),

(2003,
 'VOD',
 'Vodafone Group Plc',
 'EQUITY',
 'HALTED',
 'USD',
 '/assets/icons/VOD.svg'),

(2004,
 'GOOGL',
 'Alphabet Inc.',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/GOOGL.svg'),

(2005,
 'AMZN',
 'Amazon.com Inc.',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/AMZN.svg'),

(2006,
 'TSLA',
 'Tesla Inc.',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/TSLA.svg'),

(2007,
 'META',
 'Meta Platforms Inc.',
 'EQUITY',
 'TRADING',
 'USD',
 '/assets/icons/META.svg'),

(2008,
 'IBM',
 'International Business Machines',
 'EQUITY',
 'HALTED',
 'USD',
 '/assets/icons/IBM.svg'),

(2009,
 'SPY',
 'SPDR S&P 500 ETF Trust',
 'ETF',
 'TRADING',
 'USD',
 '/assets/icons/SPY.svg'),

(2010,
 'OLD1',
 'Retired Investment Fund',
 'FUND',
 'RETIRED',
 'USD',
 '/assets/icons/OLD1.svg'),

(2011,
 'INFY.NS',
 'Infosys Ltd',
 'EQUITY',
 'TRADING',
 'INR',
 '/assets/icons/INFY.NS.svg'),

(2012,
 'RELIANCE.NS',
 'Reliance Industries Ltd',
 'EQUITY',
 'TRADING',
 'INR',
 '/assets/icons/RELIANCE.NS.svg'),

(2013,
 'TATASTEEL.BO',
 'Tata Steel Ltd',
 'EQUITY',
 'TRADING',
 'INR',
 '/assets/icons/TATASTEEL.BO.svg');


-- ============================================================
-- 4. ORDERS - 10 rows
-- ============================================================
-- order_type = BUY or SELL
-- order_pricing_type = LIMIT or MARKET
-- order_status = NEW, FILLED, REJECTED, CANCELLED
-- ============================================================

INSERT INTO orders
(
    order_id,
    idempotency_key,
    order_status,
    received_at,
    order_type,
    order_pricing_type,
    price,
    quantity,
    transaction_date,
    account_id,
    instrument_id
)
VALUES
(
    3001,
    'IDEMP-20260823-0001',
    'NEW',
    '2026-08-23 09:00:00+01',
    'BUY',
    'LIMIT',
    185.2500,
    10,
    NULL,
    1001,
    2001
),

(
    3002,
    'IDEMP-20260823-0002',
    'FILLED',
    '2026-08-22 10:15:00+01',
    'BUY',
    'MARKET',
    520.7500,
    5,
    '2026-08-22 10:16:32+01',
    1004,
    2002
),

(
    3003,
    'IDEMP-20260823-0003',
    'CANCELLED',
    '2026-08-21 11:00:00+01',
    'SELL',
    'LIMIT',
    190.0000,
    20,
    '2026-08-21 11:05:10+01',
    1001,
    2001
),

(
    3004,
    'IDEMP-20260823-0004',
    'REJECTED',
    '2026-08-20 14:20:00+01',
    'SELL',
    'MARKET',
    8.5000,
    100,
    '2026-08-20 14:20:01+01',
    1002,
    2003
),

(
    3005,
    'IDEMP-20260823-0005',
    'NEW',
    '2026-08-23 08:30:00+01',
    'BUY',
    'LIMIT',
    195.5000,
    15,
    NULL,
    1005,
    2004
),

(
    3006,
    'IDEMP-20260823-0006',
    'FILLED',
    '2026-08-22 09:45:00+01',
    'SELL',
    'MARKET',
    135.2500,
    20,
    '2026-08-22 09:47:20+01',
    1006,
    2005
),

(
    3007,
    'IDEMP-20260823-0007',
    'CANCELLED',
    '2026-08-21 12:10:00+01',
    'BUY',
    'LIMIT',
    250.7500,
    12,
    '2026-08-21 12:30:00+01',
    1009,
    2006
),

(
    3008,
    'IDEMP-20260823-0008',
    'REJECTED',
    '2026-08-20 13:15:00+01',
    'BUY',
    'MARKET',
    505.0000,
    8,
    '2026-08-20 13:16:05+01',
    1007,
    2008
),

(
    3009,
    'IDEMP-20260823-0009',
    'FILLED',
    '2026-08-19 14:00:00+01',
    'BUY',
    'LIMIT',
    585.3000,
    30,
    '2026-08-19 14:00:45+01',
    1010,
    2009
),

(
    3010,
    'IDEMP-20260823-0010',
    'REJECTED',
    '2026-08-18 15:25:00+01',
    'SELL',
    'MARKET',
    75.0000,
    50,
    '2026-08-18 15:26:00+01',
    1008,
    2010
);


-- ============================================================
-- 5. HOLDINGS - 10 rows
-- ============================================================

INSERT INTO holdings
(
    holding_id,
    quantity,
    purchase_price,
    account_id,
    instrument_id
)
VALUES
(
    4001,
    50,
    175.5000,
    1001,
    2001
),

(
    4002,
    25,
    142.7500,
    1005,
    2004
),

(
    4003,
    40,
    128.5000,
    1006,
    2005
),

(
    4004,
    15,
    240.2500,
    1009,
    2006
),

(
    4005,
    60,
    485.7500,
    1010,
    2007
),

(
    4006,
    30,
    172.3500,
    1005,
    2009
),

(
    4007,
    20,
    450.0000,
    1006,
    2002
),

(
    4008,
    75,
    178.2500,
    1009,
    2001
),

(
    4009,
    10,
    120.0000,
    1007,
    2008
),

(
    4010,
    100,
    50.0000,
    1010,
    2010
);


COMMIT;
