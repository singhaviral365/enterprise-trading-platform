# ETL Pipeline - Complete Command Guide

A comprehensive guide to running the Capstone Sprint 7 ETL pipeline with all commands organized by task.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Database Setup](#database-setup)
4. [Extract Orders](#extract-orders)
5. [Transform & Validate](#transform--validate)
6. [Load to Analytics](#load-to-analytics)
7. [Run All Together](#run-all-together)
8. [Verify Results](#verify-results)
9. [Troubleshooting](#troubleshooting)
10. [Full Command Reference](#full-command-reference)

---

## Quick Start

### 1. One Command - Full Pipeline
```bash
cd C:\Users\Administrator\Desktop\chennai-capstone-SE3-team3-1\etl
python pipelines\run_incremental_load.py
```
**What it does**: Loads all dimensions (date, instrument, account) and incremental facts (orders) from Postgres to DuckDB in one go.

### 2. Verify Results
```bash
python tools\verify_load.py summary
```
**What it shows**: Database summary with row counts, order statuses, and totals.

### 3. First Time Setup (Clear Everything)
```bash
python pipelines\run_incremental_load.py --first-run
```
**What it does**: Clears watermark and reloads ALL data (full history, not incremental).

---

## Prerequisites & Setup

### Requirements
- Python 3.12+
- Postgres 16+ (running with trading_db database)
- DuckDB
- VS Code (recommended)

### Install Python Packages
```bash
cd C:\Users\Administrator\Desktop\chennai-capstone-SE3-team3-1\etl
pip install -r requirements.txt
```

Or manually:
```bash
pip install duckdb pandas psycopg2-binary python-dotenv pytest
```

### Verify Environment
```bash
# Test Postgres connectivity
python tools\test_postgres_connection.py

# Expected output: ✓ SUCCESS with orders in database
```

### Check .env Configuration
File: `C:\Users\Administrator\Desktop\chennai-capstone-SE3-team3-1\.env`

Should contain:
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=trading_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=n3u3d4!
```

---

## Database Setup

### Option 1: Using Existing Database

If `trading_db` already exists with data:

```bash
# Just verify it's running
python tools\test_postgres_connection.py
```

No setup needed - pipeline will connect and extract.

---

### Option 2: Initialize Database (If Starting Fresh)

#### Step 1: Create Database
```bash
# Connect to Postgres default database
psql -U postgres -d postgres -c "CREATE DATABASE trading_db;"
```

#### Step 2: Create Tables
```bash
# Run migration script (if available)
psql -U postgres -d trading_db -f db\migrations\schema.sql
```

Or manually create tables in Postgres client:
```sql
CREATE TABLE IF NOT EXISTS orders (
    order_id BIGINT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    instrument_id BIGINT NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    order_pricing_type VARCHAR(20) NOT NULL,
    quantity BIGINT NOT NULL,
    price NUMERIC(19,4) NOT NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'NEW',
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS account (
    account_id BIGINT PRIMARY KEY,
    account_number VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS instrument (
    instrument_id BIGINT PRIMARY KEY,
    instrument_ticker VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    asset_class VARCHAR(50),
    currency VARCHAR(3)
);
```

#### Step 3: Insert Test Data (Optional)
```sql
-- Insert test accounts
INSERT INTO account VALUES (1001, 'ACC000001001', 'ACTIVE');
INSERT INTO account VALUES (1002, 'ACC000001002', 'ACTIVE');

-- Insert test instruments
INSERT INTO instrument VALUES (1, 'AAPL', 'Apple Inc.', 'EQUITY', 'USD');
INSERT INTO instrument VALUES (2, 'MSFT', 'Microsoft', 'EQUITY', 'USD');

-- Insert test orders
INSERT INTO orders (order_id, account_id, instrument_id, order_type, order_pricing_type, quantity, price, order_status, received_at, transaction_date, idempotency_key)
VALUES (1, 1001, 1, 'BUY', 'LIMIT', 100, 150.50, 'NEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ord_1_unique');
```

---

## Extract Orders

### Stage 1: Extract Only
```bash
cd C:\Users\Administrator\Desktop\chennai-capstone-SE3-team3-1\etl
python pipelines\stage_1_extract.py
```

**What it does**:
- Loads watermark (last load timestamp)
- Connects to Postgres (trading_db)
- Extracts orders where `received_at > watermark`
- Shows extracted count and sample columns

**Example Output**:
```
[WATERMARK] Loading orders since: 2026-08-24 10:30:00+00:00
[EXTRACT] Connecting to Postgres...
✓ Extracted 15 orders
Columns: [account_id, symbol, side, quantity, limit_price, status, created_on]
```

### Extract All Data (First Run)
```bash
python pipelines\stage_1_extract.py --first-run
```

**What it does**: Ignores watermark and extracts ALL orders from Postgres.

### Extract with Debug Info
```bash
python -u pipelines\stage_1_extract.py 2>&1 | Tee-Object -FilePath extract_debug.log
```

**What it does**: Unbuffered output, saves to file for debugging.

---

## Transform & Validate

### Stage 2: Validate with Fresh Dimensions
```bash
python pipelines\stage_2_transform.py
```

**What it does**:
- Loads fresh dimensions from Postgres (instruments, accounts)
- Loads date dimension for current year
- Applies 8 data quality checks to orders
- Separates valid from invalid (dead-lettered) rows
- Shows validation results

**Example Output**:
```
[TRANSFORM] Preparing dimensions for validation...
  Loading dim_instrument (from Postgres)...
    -> 26 instruments
  Loading dim_account (from Postgres)...
    -> 20 current accounts

[VALIDATE] Applying 8 data quality checks...
Results:
  ✓ Valid rows: 15
  ✗ Dead-lettered: 0
```

### Validate All Data (First Run)
```bash
python pipelines\stage_2_transform.py --first-run
```

**What it does**: Extracts all orders and validates them.

### Check Dead-Lettered Rows
```bash
# If validation found errors, check them:
Get-ChildItem etl\output\dead_letter\*.csv | Select-Object -Last 1 | ForEach-Object {
    Import-Csv $_.FullName | Format-Table -AutoSize
}
```

**What it shows**: Invalid rows with reason codes (null_field, negative_quantity, etc.).

---

## Load to Analytics

### Stage 3: Load Dimensions & Facts
```bash
python pipelines\stage_3_load.py
```

**What it does**:
1. Creates DuckDB analytics database (if doesn't exist)
2. Loads dim_date (full year: 2026-01-01 to 2026-12-31)
3. Loads dim_instrument from Postgres (type 1: overwrites)
4. Loads dim_account from Postgres (type 2: maintains history)
5. Extracts, validates, and merges orders into FACT_TRADES
6. Updates watermark for next run

**Example Output**:
```
[SETUP] Ensuring analytics database exists...
  Opening: C:\...\etl\data\analytics.duckdb

[DIMENSIONS] Loading/refreshing dimensions...
  [1] dim_date (full calendar year)...
      ✓ 365 dates loaded
  [2] dim_instrument (from Postgres)...
      ✓ 26 instruments loaded
  [3] dim_account (from Postgres)...
      ✓ 20 current account versions loaded

[FACTS] Incremental order load...
  [WATERMARK] Extracting orders since: 2026-08-25 13:30:00+00:00
  [EXTRACT] Getting orders from Postgres...
      ✓ 15 orders extracted
  [TRANSFORM] Validating orders...
      ✓ 15 valid orders
  [LOAD] Merging into FACT_TRADES...
      ✓ 26 total trades in database
  [WATERMARK] Updating for next incremental run...
      ✓ Watermark updated to: 2026-08-25 13:30:00+00:00
```

### Load All Data (First Run)
```bash
python pipelines\stage_3_load.py --first-run
```

**What it does**: Clears watermark and reloads ALL orders (full history).

### Load Only (Skip Dimensions)
```bash
# This is built into stage_3, no separate command
# Use stage_3_load.py which handles both
```

---

## Run All Together

### Full E2E Pipeline (Recommended)
```bash
python pipelines\run_incremental_load.py
```

**Equivalent to running**:
1. Stage 1: Extract (with watermark filtering)
2. Stage 2: Transform & Validate (fresh dimensions)
3. Stage 3: Load (dimensions + facts)
4. Watermark update (for next run)

**Flow**:
```
Postgres (trading_db) 
    ↓
  Extract orders (since watermark)
    ↓
  Load dimensions from Postgres
    ↓
  Validate orders (8 checks)
    ↓
  Merge into FACT_TRADES (idempotent)
    ↓
  Update watermark
    ↓
  DuckDB (analytics.duckdb)
```

### Full Pipeline - First Time (Clear Everything)
```bash
python pipelines\run_incremental_load.py --first-run
```

**What it does**:
- Clears watermark
- Reloads all dimensions
- Extracts ALL orders from Postgres
- Loads everything to fresh DuckDB

### Full Pipeline with Verbose Output
```bash
python -u pipelines\run_incremental_load.py 2>&1 | Tee-Object -FilePath pipeline_full_output.log
```

**What it does**: Shows all steps, saves to log file.

---

## Verify Results

### Quick Summary
```bash
python tools\verify_load.py summary
```

**Output**:
```
Table row counts:
  dim_date                       :    365 rows
  dim_instrument                 :     26 rows
  dim_account (current)          :     20 rows
  fact_trades                    :     26 rows

Orders by status:
  CANCELLED  :   4 orders | qty=    60 | value=$   12,256.00
  FILLED     :  10 orders | qty=   174 | value=$   40,008.95
  NEW        :   6 orders | qty=   113 | value=$   14,619.65
  REJECTED   :   6 orders | qty=   248 | value=$   22,416.00
```

### View All Facts (Orders)
```bash
python tools\verify_load.py facts
```

**Output**: Complete FACT_TRADES table with joins to all dimensions.

### View All Dimensions
```bash
python tools\verify_load.py dimensions
```

**Output**: All dimension tables with full details.

### View Recent Trades
```bash
python tools\verify_load.py recent
```

**Output**: Top 20 recent trades with full detail.

### Manual DuckDB Query
```bash
duckdb C:\Users\Administrator\Desktop\chennai-capstone-SE3-team3-1\etl\data\analytics.duckdb

# In DuckDB prompt:
SELECT COUNT(*) FROM fact_trades;
SELECT * FROM fact_trades LIMIT 5;
SELECT DISTINCT status FROM fact_trades;
.exit
```

---

## Troubleshooting

### Issue: "Database not found"

**Command**:
```bash
python tools\test_postgres_connection.py
```

**Solution**: 
1. Verify Postgres is running
2. Check .env credentials
3. Create trading_db if missing

---

### Issue: "All Orders Dead-Lettered"

**Check**:
```bash
Get-ChildItem etl\output\dead_letter\*.csv | Select-Object -Last 1
```

**Common Reasons**:
- Account not in dim_account (check: `python tools\verify_load.py summary`)
- Instrument not in dim_instrument (missing new instruments)
- Negative quantity or price
- Invalid order status

**Fix**: 
1. Ensure dimensions are loaded: `python pipelines\stage_3_load.py`
2. Then run: `python pipelines\run_incremental_load.py`

---

### Issue: "Watermark Stale"

**Check Current Watermark**:
```bash
Get-Content etl\data\watermark.json
```

**Reset Watermark**:
```bash
Remove-Item etl\data\watermark.json
python pipelines\run_incremental_load.py --first-run
```

---

### Issue: "FACT_TRADES Has 0 Rows"

**Check**:
```bash
python tools\verify_load.py summary
python tools\verify_load.py facts
```

**Fix**:
1. Verify Postgres has orders: `psql -U postgres -d trading_db -c "SELECT COUNT(*) FROM orders;"`
2. Check extraction: `python pipelines\stage_1_extract.py`
3. Check validation: `python pipelines\stage_2_transform.py`

---

## Full Command Reference

### Setup & Verification
```bash
# Test Postgres connection
python tools\test_postgres_connection.py

# View database summary
python tools\verify_load.py summary
python tools\verify_load.py facts
python tools\verify_load.py dimensions
python tools\verify_load.py recent
```

### Pipeline Execution
```bash
# Full pipeline (recommended)
python pipelines\run_incremental_load.py
python pipelines\run_incremental_load.py --first-run

# Individual stages
python pipelines\stage_1_extract.py
python pipelines\stage_1_extract.py --first-run

python pipelines\stage_2_transform.py
python pipelines\stage_2_transform.py --first-run

python pipelines\stage_3_load.py
python pipelines\stage_3_load.py --first-run
```

### Debug & Logging
```bash
# Capture all output to file
python -u pipelines\run_incremental_load.py 2>&1 | Tee-Object -FilePath output.log

# Check dead-lettered rows
Get-ChildItem etl\output\dead_letter\*.csv | ForEach-Object {
    Write-Host "File: $_"
    Import-Csv $_.FullName | Format-Table -AutoSize
}

# Manual DuckDB query
duckdb etl\data\analytics.duckdb
```

### Database Operations
```bash
# Create Postgres database
psql -U postgres -d postgres -c "CREATE DATABASE trading_db;"

# Run migrations
psql -U postgres -d trading_db -f db\migrations\schema.sql

# Check Postgres data
psql -U postgres -d trading_db -c "SELECT COUNT(*) FROM orders;"
psql -U postgres -d trading_db -c "SELECT COUNT(*) FROM account;"
psql -U postgres -d trading_db -c "SELECT COUNT(*) FROM instrument;"
```

---

## Workflow Examples

### Scenario 1: First Time Setup
```bash
# 1. Test connection
python tools\test_postgres_connection.py

# 2. Load everything
python pipelines\run_incremental_load.py --first-run

# 3. Verify
python tools\verify_load.py summary
```

### Scenario 2: Daily Incremental Load
```bash
# Run (picks up only new orders since last run)
python pipelines\run_incremental_load.py

# Verify
python tools\verify_load.py summary
```

### Scenario 3: Debug a Problem
```bash
# 1. Check what would be extracted
python pipelines\stage_1_extract.py

# 2. Validate the data
python pipelines\stage_2_transform.py

# 3. Check dead-letters
Get-ChildItem etl\output\dead_letter\*.csv -ErrorAction SilentlyContinue

# 4. Load clean data
python pipelines\stage_3_load.py

# 5. Verify
python tools\verify_load.py summary
```

### Scenario 4: Reload Everything (Fresh Start)
```bash
# Option 1: Reset all data
Remove-Item etl\data\analytics.duckdb -Force -ErrorAction SilentlyContinue
Remove-Item etl\data\watermark.json -Force -ErrorAction SilentlyContinue

# Option 2: Full reload
python pipelines\run_incremental_load.py --first-run

# Verify
python tools\verify_load.py summary
```

---

## File Structure

```
etl/
├── src/
│   ├── config.py                    # Configuration & paths
│   ├── postgres_extract.py          # Extract from trading_db
│   ├── duckdb_store.py              # DuckDB operations
│   ├── validation.py                # Data quality checks
│   └── watermark.py                 # Incremental state
├── pipelines/
│   ├── run_incremental_load.py      # Full pipeline
│   ├── stage_1_extract.py           # Extract stage
│   ├── stage_2_transform.py         # Transform stage
│   └── stage_3_load.py              # Load stage
├── tools/
│   ├── test_postgres_connection.py  # Test connectivity
│   └── verify_load.py               # Query analytics DB
├── data/
│   ├── analytics.duckdb             # Analytics database
│   └── watermark.json               # Last load timestamp
└── output/
    └── dead_letter/                 # Invalid rows
```

---

## Key Features

| Feature | Command | Details |
|---------|---------|---------|
| **Incremental Load** | `python pipelines\run_incremental_load.py` | Watermark-based, only new orders |
| **Full Reload** | `python pipelines\run_incremental_load.py --first-run` | Clears watermark, reloads all |
| **Extract Only** | `python pipelines\stage_1_extract.py` | See what would be extracted |
| **Validate Only** | `python pipelines\stage_2_transform.py` | Check data quality |
| **Load Only** | `python pipelines\stage_3_load.py` | Load validated data |
| **Verify** | `python tools\verify_load.py summary` | Database summary & stats |

---

## Acceptance Criteria - All Met ✓

✓ One incremental load populates FACT_TRADES AND all 3 dimensions  
✓ Re-running is idempotent/no duplicates  
✓ Orders of ALL statuses (NEW, FILLED, CANCELLED, REJECTED) loaded  
✓ Merge/upsert using natural keys (source_order_id)  
✓ Validate: FK integrity, positive quantity/price, valid side/status  
✓ Invalid rows dead-lettered with reason + batch ID  
✓ dim_date covers required date range  
✓ README contains 3 pipeline commands ← **You are here!**  
✓ Tests cover incremental load, second run, null handling, dead-lettering  

---

## Support

For detailed information, see:
- `README.md` - Project overview
- `SPRINT-7-README.md` - Detailed pipeline documentation  
- `ORGANIZATION.md` - File structure organization
- `QUICKSTART.py` - Quick reference guide
- `ETL_FIX_REPORT.md` - Bug fixes & improvements

---

**Last Updated**: 2026-09-17  
**Pipeline Status**: ✓ Operational  
**All Commands Tested**: ✓ Yes
