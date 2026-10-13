-- ============================================================
-- schema.sql: creates trading_db with its two schemas, "trading" (order and executor services) and "auth" (auth-service), and their
-- tables. Run with psql (it uses \connect and \ir, which are psql commands):
--
--   psql -h <host> -U <user> -f databases/PostgreSQL/schema.sql
--
-- In pgAdmin, which cannot run psql commands, create trading_db (CREATE DATABASE trading_db;) and run, in this order, on it:
--   databases/PostgreSQL/migrations/trading/schema.sql
--   databases/PostgreSQL/migrations/auth/schema.sql
-- The database name is the one in config/application.yml (database.trading.name); the schema names are database.trading.schema and
-- database.auth.schema.
-- ============================================================

SELECT 'CREATE DATABASE trading_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'trading_db')\gexec

\connect trading_db
\ir migrations/trading/schema.sql
\ir migrations/auth/schema.sql
