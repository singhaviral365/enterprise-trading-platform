```bash
#!/bin/bash

set -e

# Project root = directory containing this script
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --------------------------------------------------
# Load .env
# --------------------------------------------------

if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo "ERROR: .env file not found:"
    echo "$PROJECT_ROOT/.env"
    exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

# --------------------------------------------------
# Check required SQL files
# --------------------------------------------------

SCHEMA_FILE="$PROJECT_ROOT/db/migrations/create_schema.sql"
SAMPLE_FILE="$PROJECT_ROOT/db/migrations/sample_data.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "ERROR: Schema file not found:"
    echo "$SCHEMA_FILE"
    exit 1
fi

if [ ! -f "$SAMPLE_FILE" ]; then
    echo "ERROR: Sample data file not found:"
    echo "$SAMPLE_FILE"
    exit 1
fi

echo "SQL files found."
echo "Schema: $SCHEMA_FILE"
echo "Sample data: $SAMPLE_FILE"

# --------------------------------------------------
# Check PostgreSQL connection
# --------------------------------------------------

echo
echo "Checking PostgreSQL..."

psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d postgres \
    -c "SELECT version();"

# --------------------------------------------------
# Check whether database exists
# --------------------------------------------------

DB_EXISTS=$(psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d postgres \
    -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")

# --------------------------------------------------
# Create database if necessary
# --------------------------------------------------

if [ "$DB_EXISTS" = "1" ]; then
    echo
    echo "Database '$POSTGRES_DB' already exists."
else
    echo
    echo "Creating database '$POSTGRES_DB'..."

    psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d postgres \
        -c "CREATE DATABASE \"$POSTGRES_DB\";"
fi

# --------------------------------------------------
# Run schema
# --------------------------------------------------

echo
echo "Running schema..."

psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -f "$SCHEMA_FILE"

# --------------------------------------------------
# Run sample data
# --------------------------------------------------

echo
echo "Running sample data..."

psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -f "$SAMPLE_FILE"

# --------------------------------------------------
# Cleanup
# --------------------------------------------------

unset PGPASSWORD

echo
echo "======================================"
echo "Database setup completed successfully."
echo "Database: $POSTGRES_DB"
echo "======================================"
```
