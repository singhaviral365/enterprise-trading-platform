-- ============================================================
-- AUTH DATABASE SEED DATA (auth_db): ten sample users
-- ============================================================
-- Run it after auth/schema.sql. The user_ids (1000-1009) and emails are the same ones the trading accounts in trading/seed_data.sql
-- carry, so a seeded login and its account line up. The two databases cannot enforce that; SeedDataConsistencyTest checks it.
--
-- SAMPLE ONLY: every sample user has the password   Sample@12345   (stored as an Argon2id hash, never in clear). Two-step sign-in is
-- off for them so they can sign in without an emailed code. Change or delete these users before a real deployment.

BEGIN;

INSERT INTO users (user_id, username, email, password_hash, roles, two_factor_enabled, created_on, updated_at) VALUES
  (1000, 'alice.trader', 'alice.trader@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1001, 'yuvaraj.k', 'yuvaraj.k@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1002, 'aviral.singh', 'aviral.singh@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1003, 'riya.rajesh', 'riya.rajesh@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1004, 'lalitha.prakash', 'lalitha.prakash@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1005, 'vishal.fmri', 'vishal.fmri@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1006, 'aashifa.aalifa', 'aashifa.aalifa@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1007, 'swetha.fmri', 'swetha.fmri@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1008, 'agneya.fmri', 'agneya.fmri@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW()),

  (1009, 'nanditha.fmri', 'nanditha.fmri@example.com',
   '$argon2id$v=19$m=65536,p=2,t=3$dDrkssu/nFE/y5SxhiU59Q$SZ3GCsfm44iEmp2Iz1u2K9HKqiD1lMHaM7DqwFBt/jw',
   ARRAY['CUSTOMER'], FALSE, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- The next generated user_id is one past the highest in use (and never below 1000).
SELECT setval(pg_get_serial_sequence('users', 'user_id'), GREATEST((SELECT COALESCE(MAX(user_id), 0) FROM users) + 1, 1000), false);

COMMIT;
