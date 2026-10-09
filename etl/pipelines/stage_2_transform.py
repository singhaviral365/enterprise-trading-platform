#!/usr/bin/env python3
"""
STAGE 2: TRANSFORM & VALIDATE
=============================
Validate extracted orders and prepare for loading.

This stage:
- Reads extracted orders from Postgres
- Applies 8 data quality checks
- Separates valid from invalid (dead-lettered) rows
- Dead-lettered rows are written to CSV for inspection
- Valid rows are returned for loading

Data Quality Checks:
  1. All required fields non-null
  2. Quantity > 0
  3. Price > 0
  4. Side IN {BUY, SELL}
  5. Status IN {NEW, FILLED, REJECTED, CANCELLED}
  6. Account exists in dimensions
  7. Instrument exists in dimensions
  8. Date valid and trade_value = quantity × price

Usage:
    python stage_2_transform.py [--first-run]
    
    --first-run: Use current data in DuckDB for validation
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
import argparse

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from src.postgres_extract import (
    extract_orders,
    extract_instruments,
    extract_accounts,
    PostgresExtractError,
)
from src.duckdb_store import (
    create_analytical_store,
    open_analytical_store,
    load_dim_date,
    load_dim_instrument,
    load_dim_account,
    get_dimension_keys,
    get_existing_order_ids,
)
from src.validation import validate_and_split
from src.watermark import load_watermark
from src.config import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    WATERMARK_FILE,
    DUCKDB_DB_PATH,
    SCHEMA_PATH,
)

def main():
    parser = argparse.ArgumentParser(description="STAGE 2: Transform & validate orders")
    parser.add_argument("--first-run", action="store_true", help="Extract all orders for validation")
    args = parser.parse_args()
    
    print("=" * 80)
    print("STAGE 2: TRANSFORM & VALIDATE - Data quality checks")
    print("=" * 80)
    print()
    
    # Extract orders
    print("[EXTRACT] Getting orders from Postgres...")
    watermark = load_watermark(WATERMARK_FILE) if not args.first_run else None
    
    if watermark is None:
        print("  Extracting: ALL orders (first run or --first-run specified)")
    else:
        print(f"  Extracting: Orders since {watermark}")
    
    try:
        orders_df = extract_orders(
            host=POSTGRES_HOST,
            port=int(POSTGRES_PORT),
            db=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            since=watermark,
        )
    except PostgresExtractError as exc:
        print(f"✗ ERROR: Failed to extract orders: {exc}")
        sys.exit(1)
    
    print(f"✓ Extracted {len(orders_df)} orders")
    print()
    
    if len(orders_df) == 0:
        print("No new orders to process.")
        print()
        print("=" * 80)
        print("STAGE 2 COMPLETE: No changes")
        print("=" * 80)
        print()
        return
    
    # Connect to DuckDB and load dimensions
    print("[TRANSFORM] Preparing dimensions for validation...")
    print()
    
    try:
        # Ensure DuckDB database exists
        DUCKDB_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not DUCKDB_DB_PATH.exists():
            create_analytical_store(db_path=DUCKDB_DB_PATH, schema_path=SCHEMA_PATH)
        
        con = open_analytical_store(DUCKDB_DB_PATH)
        
        # Load/refresh dimensions from Postgres
        print("  Loading dim_date (full calendar year)...")
        load_dim_date(con, "2026-01-01", "2026-12-31")
        date_count = con.execute("SELECT COUNT(*) FROM dim_date").fetchone()[0]
        print(f"    -> {date_count} dates")
        
        print("  Loading dim_instrument (from Postgres)...")
        instruments_df = extract_instruments(
            host=POSTGRES_HOST,
            port=int(POSTGRES_PORT),
            db=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
        )
        load_dim_instrument(con, instruments_df)
        instr_count = con.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
        print(f"    -> {instr_count} instruments")
        
        print("  Loading dim_account (from Postgres)...")
        accounts_df = extract_accounts(
            host=POSTGRES_HOST,
            port=int(POSTGRES_PORT),
            db=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
        )
        load_dim_account(con, accounts_df)
        acct_count = con.execute("SELECT COUNT(*) FROM dim_account WHERE is_current = TRUE").fetchone()[0]
        print(f"    -> {acct_count} current accounts")
        
        print()
        
        # Now get dimension keys for validation
        dimension_keys = get_dimension_keys(con)
        existing_order_ids = get_existing_order_ids(con)
        
    except Exception as exc:
        print(f"✗ ERROR: Failed to load dimensions: {exc}")
        sys.exit(1)
    
    print(f"  Accounts: {len(dimension_keys['account_keys'])} available")
    print(f"  Instruments: {len(dimension_keys['instrument_keys'])} available")
    print(f"  Dates: {len(dimension_keys['date_keys'])} available")
    print()
    
    # Validate
    batch_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    print("[VALIDATE] Applying 8 data quality checks...")
    print()
    
    valid_df, dead_letters = validate_and_split(
        orders_df,
        dimension_keys,
        existing_order_ids,
        batch_id,
    )
    
    valid_count = len(valid_df)
    dead_count = len(dead_letters)
    
    print(f"Results:")
    print(f"  ✓ Valid rows: {valid_count}")
    print(f"  ✗ Dead-lettered: {dead_count}")
    print()
    
    if dead_count > 0:
        print("Dead-lettered rows:")
        for i, dl in enumerate(dead_letters[:5], 1):
            print(f"  {i}. Order {dl.source_order_id}: {dl.reason} - {dl.details[:50]}...")
        if dead_count > 5:
            print(f"  ... and {dead_count - 5} more")
        print()
    
    print("=" * 80)
    print(f"STAGE 2 COMPLETE: {valid_count} valid orders ready to load")
    print("=" * 80)
    print()
    print("Next step:")
print("  python pipelines/stage_3_load.py")
    con.close()


if __name__ == "__main__":
    main()
