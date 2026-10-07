-- Safe to run more than once: rows that already exist are left alone (ON CONFLICT DO NOTHING), and the contact
-- details of sample accounts that predate the email and phone_no columns are filled in at the end.

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
 '2023-03-20')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 2. ACCOUNT - 10 rows
-- ============================================================
-- user_id is independent and has no foreign key reference.
-- user_id values start from 1000 and increment by 1.
-- email and phone_no are the contact details given at account set-up. The email of each sample account is the SAME,
-- written out in full, as the email of the Auth user with that user_id (auth_setup.sql, update_auth_db.sql). The two
-- databases cannot enforce that, so SeedDataConsistencyTest fails the build if they ever differ.
-- ============================================================

INSERT INTO account
(
    account_id,
    account_number,
    user_id,
    email,
    phone_no,
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
    'alice.trader@example.com',
    '+353850000001',
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
    'yuvaraj.k@example.com',
    '+353850000002',
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
    'aviral.singh@example.com',
    '+353850000003',
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
    'riya.rajesh@example.com',
    '+353850000004',
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
    'lalitha.prakash@example.com',
    '+353850000005',
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
    'vishal.fmri@example.com',
    '+353850000006',
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
    'aashifa.aalifa@example.com',
    '+353850000007',
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
    'swetha.fmri@example.com',
    '+353850000008',
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
    'agneya.fmri@example.com',
    '+353850000009',
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
    'nanditha.fmri@example.com',
    '+353850000010',
    '2025-07-10',
    61500.0000,
    50000.0000,
    'ACTIVE',
    'USD',
    9,
    NULL,
    NULL
)
ON CONFLICT DO NOTHING;


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
 '/assets/icons/TATASTEEL.BO.svg')
ON CONFLICT DO NOTHING;


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
)
ON CONFLICT DO NOTHING;


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
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. CUSTOMER PREFERENCE - 10 rows (one per sample account)
-- ============================================================
-- Each account's preferred currency is its own currency. The formats and switches vary a little so every option
-- has an example. Accounts with no row would simply use the defaults.

INSERT INTO customer_preference
(
    account_id,
    preferred_currency,
    channel_sms,
    channel_email,
    channel_in_app,
    notify_order_status,
    notify_watchlist_alerts,
    date_format,
    time_format,
    number_format,
    ai_assistant_enabled,
    theme,
    landing_page,
    default_order_type
)
SELECT
    a.account_id,
    a.currency,
    p.channel_sms,
    p.channel_email,
    p.channel_in_app,
    p.notify_order_status,
    p.notify_watchlist_alerts,
    p.date_format,
    p.time_format,
    p.number_format,
    p.ai_assistant_enabled,
    p.theme,
    p.landing_page,
    p.default_order_type
FROM (VALUES
    (1001, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  'DD_MM_YYYY',    'H24', 'US', TRUE,  'SYSTEM', 'DASHBOARD', 'MARKET'),
    (1002, FALSE, FALSE, TRUE,  TRUE,  FALSE, 'MM_DD_YYYY',    'H12', 'US', FALSE, 'LIGHT',  'MARKET',    'LIMIT'),
    (1003, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'DD_MONTH_YYYY', 'H24', 'IN', TRUE,  'DARK',   'POSITIONS', 'MARKET'),
    (1004, FALSE, TRUE,  FALSE, TRUE,  TRUE,  'YYYY_MM_DD',    'H24', 'US', FALSE, 'SYSTEM', 'ORDERS',    'LIMIT'),
    (1005, FALSE, FALSE, FALSE, FALSE, FALSE, 'DD_MON_YYYY',   'H12', 'IN', FALSE, 'SYSTEM', 'DASHBOARD', 'MARKET'),
    (1006, TRUE,  FALSE, TRUE,  TRUE,  TRUE,  'MON_DD_YYYY',   'H12', 'US', TRUE,  'DARK',   'DASHBOARD', 'MARKET'),
    (1007, FALSE, TRUE,  TRUE,  FALSE, TRUE,  'DD_MM_YYYY',    'H24', 'US', FALSE, 'LIGHT',  'MARKET',    'MARKET'),
    (1008, FALSE, FALSE, TRUE,  TRUE,  TRUE,  'MM_DD_YYYY',    'H12', 'US', FALSE, 'SYSTEM', 'DASHBOARD', 'LIMIT'),
    (1009, TRUE,  TRUE,  FALSE, TRUE,  FALSE, 'DD_MONTH_YYYY', 'H24', 'IN', TRUE,  'SYSTEM', 'POSITIONS', 'MARKET'),
    (1010, FALSE, FALSE, TRUE,  TRUE,  TRUE,  'MON_DD_YYYY',   'H12', 'US', FALSE, 'DARK',   'ORDERS',    'MARKET')
) AS p
(
    account_id,
    channel_sms,
    channel_email,
    channel_in_app,
    notify_order_status,
    notify_watchlist_alerts,
    date_format,
    time_format,
    number_format,
    ai_assistant_enabled,
    theme,
    landing_page,
    default_order_type
)
JOIN account a ON a.account_id = p.account_id
ON CONFLICT (account_id) DO NOTHING;


-- ============================================================
-- 7. CONTACT DETAILS FOR SAMPLE ACCOUNTS ALREADY IN THE DATABASE
-- ============================================================
-- The email of each of these ten accounts is FIXED here and is the same address the Auth user with that user_id has
-- (update_auth_db.sql / auth_setup.sql). It is set whenever it differs, so a machine that still holds an older sample
-- address is brought in line. The phone number is only filled when missing. Accounts that are not in this list (anyone
-- who registered through the app) are never touched.

UPDATE account a
SET email    = c.email,
    phone_no = COALESCE(a.phone_no, c.phone_no)
FROM (VALUES
    (1001, 1000, 'alice.trader@example.com', '+353850000001'),
    (1002, 1001, 'yuvaraj.k@example.com', '+353850000002'),
    (1003, 1002, 'aviral.singh@example.com', '+353850000003'),
    (1004, 1003, 'riya.rajesh@example.com', '+353850000004'),
    (1005, 1004, 'lalitha.prakash@example.com', '+353850000005'),
    (1006, 1005, 'vishal.fmri@example.com', '+353850000006'),
    (1007, 1006, 'aashifa.aalifa@example.com', '+353850000007'),
    (1008, 1007, 'swetha.fmri@example.com', '+353850000008'),
    (1009, 1008, 'agneya.fmri@example.com', '+353850000009'),
    (1010, 1009, 'nanditha.fmri@example.com', '+353850000010')
) AS c (account_id, user_id, email, phone_no)
WHERE a.account_id = c.account_id
  AND a.user_id = c.user_id
  AND (a.email IS DISTINCT FROM c.email OR a.phone_no IS NULL);


COMMIT;
