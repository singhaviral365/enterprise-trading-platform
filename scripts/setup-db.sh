#!/usr/bin/env bash
# Creates both databases (trading_db and auth_db) with all their tables and loads the sample data, using psql.
#
#   bash scripts/setup-db.sh              schema and seed data
#   bash scripts/setup-db.sh --no-seed    schema only
#
# The host, port, user and password come from config/application.yml (database.trading.*). The files it runs are
# databases/PostgreSQL/schema.sql and seed_data.sql; in pgAdmin run databases/PostgreSQL/{trading,auth}/{schema,seed_data}.sql instead.
# Run it once on a new server: the schema is for empty databases and stops with an error if the tables already exist.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cfg() { node "$ROOT/config/cli.js" get "$1"; }

export PGPASSWORD="$(cfg database.trading.password)"
HOST="$(cfg database.trading.host)"
PORT="$(cfg database.trading.port)"
USER="$(cfg database.trading.user)"
TRADING_DB="$(cfg database.trading.name)"
AUTH_DB="$(cfg database.auth.name)"

if [ "$TRADING_DB" != "trading_db" ] || [ "$AUTH_DB" != "auth_db" ]; then
    echo "databases/PostgreSQL/schema.sql creates trading_db and auth_db; config/application.yml names '$TRADING_DB' and '$AUTH_DB'." >&2
    echo "Either use the default names, or edit the two names at the top of schema.sql and seed_data.sql." >&2
    exit 1
fi

echo "Checking PostgreSQL at $HOST:$PORT..."
psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT version();"

echo "Creating the databases and tables..."
psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -q -f "$ROOT/databases/PostgreSQL/schema.sql"

if [ "${1:-}" != "--no-seed" ]; then
    echo "Loading the sample data..."
    psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -q -f "$ROOT/databases/PostgreSQL/seed_data.sql"
fi

echo "Done: $TRADING_DB and $AUTH_DB are ready."
