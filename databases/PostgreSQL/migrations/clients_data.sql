BEGIN;

-- ============================================================
-- CLIENT - 10 rows
-- ============================================================

INSERT INTO client
(
    client_id,
    client_name,
    email,
    password_hash,
    phone_no,
    dob,
    join_date
)
VALUES
(
    101,
    'John Smith',
    'john.smith@example.com',
    '$2b$12$clienthash001',
    '+353850000001',
    '1985-04-12',
    '2022-01-10'
),

(
    102,
    'Olivia Martin',
    'olivia.martin@example.com',
    '$2b$12$clienthash002',
    '+353850000002',
    '1990-08-21',
    '2022-04-15'
),

(
    103,
    'David Taylor',
    'david.taylor@example.com',
    '$2b$12$clienthash003',
    '+353850000003',
    '1978-02-18',
    '2023-02-01'
),

(
    104,
    'Sophia Anderson',
    'sophia.anderson@example.com',
    '$2b$12$clienthash004',
    '+353850000004',
    '1995-10-03',
    '2023-06-12'
),

(
    105,
    'James Thomas',
    'james.thomas@example.com',
    '$2b$12$clienthash005',
    '+353850000005',
    '1982-12-29',
    '2024-01-20'
),

(
    106,
    'Liam Harris',
    'liam.harris@example.com',
    '$2b$12$clienthash006',
    '+353850000006',
    '1988-03-15',
    '2024-02-12'
),

(
    107,
    'Amelia Walker',
    'amelia.walker@example.com',
    '$2b$12$clienthash007',
    '+353850000007',
    '1992-11-07',
    '2024-05-08'
),

(
    108,
    'Noah Hall',
    'noah.hall@example.com',
    '$2b$12$clienthash008',
    '+353850000008',
    '1975-06-25',
    '2024-07-19'
),

(
    109,
    'Mia Allen',
    'mia.allen@example.com',
    '$2b$12$clienthash009',
    '+353850000009',
    '1998-01-30',
    '2025-01-15'
),

(
    110,
    'Oliver Young',
    'oliver.young@example.com',
    '$2b$12$clienthash010',
    '+353850000010',
    '1986-09-17',
    '2025-04-21'
);

COMMIT;