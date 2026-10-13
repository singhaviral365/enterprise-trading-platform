-- ============================================================
-- seed_data.sql: loads the sample data into the "trading" and "auth" schemas of trading_db (run schema.sql first). Run with psql:
--
--   psql -h <host> -U <user> -f databases/PostgreSQL/seed_data.sql
--
-- In pgAdmin run on trading_db, in this order:
--   databases/PostgreSQL/migrations/trading/seed_data.sql
--   databases/PostgreSQL/migrations/auth/seed_data.sql
-- ============================================================

\connect trading_db
\ir migrations/trading/seed_data.sql
\ir migrations/auth/seed_data.sql
