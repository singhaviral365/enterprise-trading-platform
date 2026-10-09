#!/usr/bin/env python3
"""
STAGE 3: LOAD
=============
Load dimensions and facts into the DuckDB analytics database.

This stage:
- Ensures the analytics database and schema exist
- Loads/refreshes dimensions (dim_date, dim_instrument, dim_account)
- Extracts, validates, and loads fact_trades (orders) incrementally
- Updates the watermark for the next incremental run
- Performs idempotent merge on FACT_TRADES using natural key (source_order_id)

Usage:
    python stage_3_load.py [--first-run]
    
    --first-run: Clear watermark and reload all data from Postgres
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
import argparse

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from src.postgres_extract import extract_orders, extract_instruments, extract_accounts, PostgresExtractError
from src.duckdb_store import (
    create_analytical_store,
    open_analytical_store,
    load_dim_date,
    load_dim_instrument,
    load_dim_account,
    load_fact_trades,
    get_dimension_keys,
    get_existing_order_ids,
)
from src.validation import validate_and_split, save_dead_letters
from src.watermark import load_watermark, save_watermark
from src.config import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    DUCKDB_DB_PATH,
    SCHEMA_PATH,
    WATERMARK_FILE,
)

def main():
    parser = argparse.ArgumentParser(description="STAGE 3: Load dimensions and facts into DuckDB")
    parser.add_argument("--first-run", action="store_true", help="Clear watermark and reload all data")
    args = parser.parse_args()
    
    print("=" * 80)
    print("STAGE 3: LOAD - Dimensions & Facts into DuckDB")
    print("=" * 80)
    print()
    
    batch_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    
    # Setup database
    print("[SETUP] Ensuring analytics database exists...")
    DUCKDB_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    if not DUCKDB_DB_PATH.exists():
        print(f"  Creating: {DUCKDB_DB_PATH}")
        create_analytical_store(db_path=DUCKDB_DB_PATH, schema_path=SCHEMA_PATH)
    else:
        print(f"  Opening: {DUCKDB_DB_PATH}")
    
    con = open_analytical_store(DUCKDB_DB_PATH)
    print("✓ Database ready")
    print()
    
    # Load dimensions
    print("[DIMENSIONS] Loading/refreshing dimensions...")
    print()
    
    print("  [1] dim_date (full calendar year)...")
    load_dim_date(con, "2026-01-01", "2026-12-31")
    date_count = con.execute("SELECT COUNT(*) FROM dim_date").fetchone()[0]
    print(f"      ✓ {date_count} dates loaded")
    
    print("  [2] dim_instrument (from Postgres)...")
    try:
        instruments_df = extract_instruments(
            host=POSTGRES_HOST,
            port=int(POSTGRES_PORT),
            db=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
        )
        load_dim_instrument(con, instruments_df)
        instr_count = con.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
        print(f"      ✓ {instr_count} instruments loaded")
    except PostgresExtractError as exc:
        print(f"      ✗ ERROR: {exc}")
        con.close()
        sys.exit(1)
    
    print("  [3] dim_account (from Postgres)...")
    try:
        accounts_df = extract_accounts(
            host=POSTGRES_HOST,
            port=int(POSTGRES_PORT),
            db=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
        )
        load_dim_account(con, accounts_df)
        acct_count = con.execute("SELECT COUNT(*) FROM dim_account WHERE is_current = TRUE").fetchone()[0]
        print(f"      ✓ {acct_count} current account versions loaded")
    except PostgresExtractError as exc:
        print(f"      ✗ ERROR: {exc}")
        con.close()
        sys.exit(1)
    
    print()
    
    # Extract & validate orders
    print("[FACTS] Incremental order load...")
    print()
    
    watermark = load_watermark(WATERMARK_FILE)
    if args.first_run:
        print("  [WATERMARK] --first-run specified, extracting ALL orders")
        watermark = None
    elif watermark is None:
        print("  [WATERMARK] No watermark found, extracting ALL orders (first load)")
    else:
        print(f"  [WATERMARK] Extracting orders since: {watermark}")
    
    print()
    
    print("  [EXTRACT] Getting orders from Postgres...")
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
        print(f"      ✗ ERROR: {exc}")
        con.close()
        sys.exit(1)
    
    extracted_count = len(orders_df)
    print(f"      ✓ {extracted_count} orders extracted")
    
    if extracted_count == 0:
        print()
        print("  No new orders to load.")
        con.close()
        print()
        print("=" * 80)
        print("STAGE 3 COMPLETE: Database up to date")
        print("=" * 80)
        print()
        return
    
    print()
    print("  [TRANSFORM] Validating orders...")
    
    dimension_keys = get_dimension_keys(con)
    existing_order_ids = get_existing_order_ids(con)
    
    valid_df, dead_letters = validate_and_split(
        orders_df,
        dimension_keys,
        existing_order_ids,
        batch_id,
    )
    
    valid_count = len(valid_df)
    dead_count = len(dead_letters)
    
    print(f"      ✓ {valid_count} valid orders")
    print(f"      ✗ {dead_count} dead-lettered orders")
    
    if dead_count > 0:
        print()
        print("  Dead-lettered samples (first 5):")
        for i, dl in enumerate(dead_letters[:5], 1):
            print(f"    {i}. Order {dl.source_order_id}: {dl.reason} - {dl.details}")
    
    print(f"      ✓ {valid_count} valid orders")
    if dead_count > 0:
        print(f"      ✗ {dead_count} dead-lettered orders")
        save_dead_letters(dead_letters, WATERMARK_FILE.parent)
    
    print()
    
    if valid_count > 0:
        print("  [LOAD] Merging into FACT_TRADES...")
        load_fact_trades(con, valid_df)
        fact_count = con.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
        print(f"      ✓ {fact_count} total trades in database")
    
    print()
    
    # Update watermark
    if valid_count > 0:
        last_timestamp = valid_df['created_at'].max()
        print("  [WATERMARK] Updating for next incremental run...")
        save_watermark(WATERMARK_FILE, last_timestamp, batch_id)
        print(f"      ✓ Watermark updated to: {last_timestamp}")
    
    con.close()
    
    print()
    print("=" * 80)
    print(f"STAGE 3 COMPLETE: {valid_count} orders loaded, {dead_count} dead-lettered")
    print("=" * 80)
    print()


if __name__ == "__main__":
    main()
