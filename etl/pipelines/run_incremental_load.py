#!/usr/bin/env python3
"""
Real Incremental Load: From Postgres (trading_db) to DuckDB Analytics

This script demonstrates:
1. Loading actual data from the trading_db Postgres database
2. Incremental loading with watermark progression
3. Verification and inspection of loaded data
4. Dead-letter handling for bad rows

Usage:
    python run_incremental_load.py [--first-run]
    
    --first-run: Clear watermark and reload all data
"""

import sys
import logging
from pathlib import Path
from datetime import datetime, timezone
import argparse
import tempfile
import json

# Add etl to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from src.duckdb_store import (
    create_analytical_store,
    load_dim_date,
    load_dim_instrument,
    load_dim_account,
    load_fact_trades,
    open_analytical_store,
    get_dimension_keys,
    get_existing_order_ids,
)
from src.postgres_extract import (
    extract_orders,
    extract_instruments,
    extract_accounts,
    PostgresExtractError,
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
    WATERMARK_FILE,
    DEAD_LETTER_DIR,
    SCHEMA_PATH,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


def print_section(title: str):
    """Print a formatted section header."""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)


def print_subsection(title: str):
    """Print a formatted subsection header."""
    print("\n" + "-"*80)
    print(f"  {title}")
    print("-"*80)


def run_full_pipeline(first_run: bool = False, date_range_start: str = "2026-01-01", date_range_end: str = "2026-12-31"):
    """
    Run the full ETL pipeline: extract, transform, load.
    
    Args:
        first_run: If True, reset watermark and load all data
        date_range_start: Start date for dim_date
        date_range_end: End date for dim_date
    """
    
    print_section("INCREMENTAL ETL LOAD: Postgres (trading_db) -> DuckDB Analytics")
    
    batch_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    logger.info("Starting load (batch_id=%s)", batch_id)
    
    try:
        # Setup
        print_subsection("SETUP: Creating/Opening Analytics Database")
        
        DUCKDB_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        if not DUCKDB_DB_PATH.exists():
            print(f"\n[CREATE] Database not found, creating at {DUCKDB_DB_PATH}")
            create_analytical_store(db_path=DUCKDB_DB_PATH, schema_path=SCHEMA_PATH)
            print("✓ Database created and schema applied")
        else:
            print(f"\n[OPEN] Opening existing database at {DUCKDB_DB_PATH}")
        
        con = open_analytical_store(DUCKDB_DB_PATH)
        print("✓ Connected to analytics database\n")
        
        # Load dimensions
        print_subsection("LOAD DIMENSIONS")
        
        print("\n[1] Loading dim_date (full year range)...")
        load_dim_date(con, date_range_start, date_range_end)
        date_count = con.execute("SELECT COUNT(*) FROM dim_date").fetchone()[0]
        print(f"✓ Loaded {date_count} dates\n")
        
        print("[2] Extracting instruments from Postgres...")
        try:
            instruments_df = extract_instruments(
                host=POSTGRES_HOST,
                port=int(POSTGRES_PORT),
                db=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
            )
            print(f"✓ Extracted {len(instruments_df)} instruments from Postgres\n")
            
            if len(instruments_df) > 0:
                print("  Instruments:")
                for _, row in instruments_df.iterrows():
                    print(f"    - {row['symbol']:15} {row['name']:30} ({row['asset_class']})")
                print()
                
                print("  Loading into dim_instrument...")
                load_dim_instrument(con, instruments_df)
                instr_count = con.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
                print(f"✓ Loaded {instr_count} instruments\n")
        except PostgresExtractError as exc:
            logger.error("Failed to extract instruments: %s", exc)
            print(f"✗ Error extracting instruments: {exc}\n")
            return
        
        print("[3] Extracting accounts from Postgres...")
        try:
            accounts_df = extract_accounts(
                host=POSTGRES_HOST,
                port=int(POSTGRES_PORT),
                db=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
            )
            print(f"✓ Extracted {len(accounts_df)} accounts from Postgres\n")
            
            if len(accounts_df) > 0:
                print("  Accounts:")
                for _, row in accounts_df.iterrows():
                    print(f"    - {row['account_id']:20} {row['holder_name']:25} ({row['status']})")
                print()
                
                print("  Loading into dim_account...")
                load_dim_account(con, accounts_df)
                acct_count = con.execute("SELECT COUNT(*) FROM dim_account WHERE is_current = TRUE").fetchone()[0]
                print(f"✓ Loaded {acct_count} current account versions\n")
        except PostgresExtractError as exc:
            logger.error("Failed to extract accounts: %s", exc)
            print(f"✗ Error extracting accounts: {exc}\n")
            return
        
        # Incremental fact load
        print_subsection("INCREMENTAL FACT LOAD: Orders")
        
        # Check watermark
        watermark = load_watermark(WATERMARK_FILE)
        if first_run and watermark is not None:
            print(f"\n[WATERMARK] --first-run specified, clearing watermark")
            watermark = None
        
        if watermark is None:
            print(f"\n[WATERMARK] No watermark found")
            print("→ This is the first load; ALL orders will be extracted")
        else:
            print(f"\n[WATERMARK] Current watermark: {watermark}")
            print("→ Only orders with received_at > watermark will be extracted")
        print()
        
        # Extract orders
        print("[EXTRACT] Extracting orders from Postgres...")
        try:
            orders_df = extract_orders(
                host=POSTGRES_HOST,
                port=int(POSTGRES_PORT),
                db=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                since=watermark,
            )
            
            extracted_count = len(orders_df)
            print(f"✓ Extracted {extracted_count} orders from Postgres\n")
            
            # Debug: show DataFrame columns
            print(f"  DataFrame columns: {list(orders_df.columns)}\n")
            
            if extracted_count == 0:
                print("No new orders to process. Pipeline complete.\n")
                con.close()
                return
            
            # Show extracted data
            print("  Extracted orders:")
            print("  " + "-"*76)
            for _, row in orders_df.iterrows():
                created = pd.Timestamp(row['created_on']).strftime("%Y-%m-%d %H:%M")
                print(f"  {row['source_order_id']:8} | {row['account_id']:6} | qty={row['quantity']:3d} | price={row['limit_price']:8.2f} | {row['status']:8} | {created}")
            print("  " + "-"*76)
            print()
            
        except PostgresExtractError as exc:
            logger.error("Failed to extract orders: %s", exc)
            print(f"✗ Error extracting orders: {exc}\n")
            return
        
        # Create lookup map for instrument_id -> symbol
        # We need to join orders with instruments to get symbols
        print("[TRANSFORM] Preparing order data...")
        
        # Note: The extract query now includes symbol directly via JOIN,
        # so we don't need to lookup instrument_id anymore
        
        # Validate orders
        print("[VALIDATE] Checking data quality...\n")
        
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
        
        print(f"  Valid rows: {valid_count}")
        print(f"  Dead-lettered: {dead_count}\n")
        
        if dead_count > 0:
            print("  Dead-lettered rows:")
            print("  " + "-"*76)
            for dl in dead_letters:
                print(f"  {dl.source_order_id:8} | {dl.reason:25} | {dl.details[:38]}")
            print("  " + "-"*76)
            print()
            
            # Save dead letters
            dl_path = save_dead_letters(dead_letters, DEAD_LETTER_DIR)
            print(f"  → Saved to {dl_path}\n")
        
        # Load facts
        if valid_count == 0:
            print("[LOAD] No valid rows to load.\n")
            loaded_count = 0
        else:
            print(f"[LOAD] Merging {valid_count} orders into FACT_TRADES...")
            loaded_count = load_fact_trades(con, valid_df)
            print(f"✓ Loaded {loaded_count} rows\n")
        
        # Update watermark
        if extracted_count > 0:
            max_created_on = pd.to_datetime(orders_df['created_on']).max()
            save_watermark(WATERMARK_FILE, max_created_on, batch_id)
            print(f"[WATERMARK] Updated: {max_created_on}\n")
        
        # Verification
        print_subsection("VERIFICATION: Analytics Database State")
        
        fact_count = con.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
        print(f"\n  FACT_TRADES row count: {fact_count}")
        
        # Show summary by status
        status_summary = con.execute("""
            SELECT status, COUNT(*) as cnt
            FROM fact_trades
            GROUP BY status
            ORDER BY status
        """).fetchall()
        
        print("\n  Orders by status:")
        for status, cnt in status_summary:
            print(f"    - {status:10} : {cnt:3d}")
        
        # Show recent facts
        print("\n  Most recent facts (limit 5):")
        print("  " + "-"*76)
        recent = con.execute("""
            SELECT source_order_id, side, quantity, price, status, created_at
            FROM fact_trades
            ORDER BY created_at DESC
            LIMIT 5
        """).fetchall()
        
        for row in recent:
            created = pd.Timestamp(row[5]).strftime("%Y-%m-%d %H:%M")
            print(f"  {row[0]:8} | {row[1]:4} | qty={row[2]:3d} | price={row[3]:8.2f} | {row[4]:8} | {created}")
        print("  " + "-"*76)
        
        con.close()
        
        # Summary
        print_section("SUMMARY")
        
        print(f"\n  Batch ID:           {batch_id}")
        print(f"  Extracted:          {extracted_count} orders")
        print(f"  Valid:              {valid_count} orders")
        print(f"  Dead-lettered:      {dead_count} orders")
        print(f"  Loaded:             {loaded_count} rows")
        print(f"  FACT_TRADES total:  {fact_count} rows")
        
        if watermark:
            watermark_file_content = json.loads(WATERMARK_FILE.read_text())
            print(f"  Watermark:          {watermark_file_content['last_load_timestamp']}")
        
        print("\n  ✓ Pipeline completed successfully!\n")
        
    except Exception as exc:
        logger.error("Pipeline failed: %s", exc, exc_info=True)
        print(f"\n✗ Pipeline failed: {exc}\n")
        raise


def main():
    """Parse arguments and run pipeline."""
    
    parser = argparse.ArgumentParser(
        description="Incremental ETL Load from Postgres (trading_db) to DuckDB"
    )
    parser.add_argument(
        "--first-run",
        action="store_true",
        help="Clear watermark and reload all data (for first run or testing)"
    )
    parser.add_argument(
        "--date-start",
        default="2026-01-01",
        help="Start date for dim_date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--date-end",
        default="2026-12-31",
        help="End date for dim_date (YYYY-MM-DD)"
    )
    
    args = parser.parse_args()
    
    try:
        run_full_pipeline(
            first_run=args.first_run,
            date_range_start=args.date_start,
            date_range_end=args.date_end,
        )
    except KeyboardInterrupt:
        print("\n\nPipeline interrupted by user.\n")
        sys.exit(1)
    except Exception as exc:
        logger.error("Unhandled error: %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
