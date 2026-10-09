-- ============================================================
-- schema.sql: creates BOTH databases and all their tables. Run with psql (it uses \connect and \ir, which are psql commands):
--
--   psql -h <host> -U <user> -f databases/PostgreSQL/schema.sql
--
-- In pgAdmin, which cannot run psql commands, open a Query Tool on each database and run its own file instead:
--   trading_db  ->  databases/PostgreSQL/trading/schema.sql
--   auth_db     ->  databases/PostgreSQL/auth/schema.sql
-- (create the two empty databases first: CREATE DATABASE trading_db; CREATE DATABASE auth_db;)
-- The database names are the ones in config/application.yml (database.trading.name, database.auth.name).
-- ============================================================

SELECT 'CREATE DATABASE trading_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'trading_db')\gexec
SELECT 'CREATE DATABASE auth_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec

\connect trading_db
\ir migration/trading/schema.sql

\connect auth_db
\ir migration/auth/schema.sql
