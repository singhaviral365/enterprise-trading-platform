-- ============================================================
-- seed_data.sql: loads the sample data into BOTH databases (run schema.sql first). Run with psql:
--
--   psql -h <host> -U <user> -f databases/PostgreSQL/seed_data.sql
--
-- In pgAdmin run each file on its own database instead:
--   trading_db  ->  databases/PostgreSQL/trading/seed_data.sql
--   auth_db     ->  databases/PostgreSQL/auth/seed_data.sql
-- ============================================================

\connect trading_db
\ir migration/trading/seed_data.sql

\connect auth_db
\ir migration/auth/seed_data.sql
