#!/usr/bin/env python3
"""
STAGE 1: EXTRACT
===============
Extract orders from Postgres (trading_db) since the last watermark.

This stage:
- Loads the watermark (last extraction timestamp)
- Connects to Postgres
- Retrieves orders where received_at > watermark
- Saves extracted data to a temporary file for inspection
- Returns DataFrame with columns: account_id, symbol, side, quantity, limit_price, status, created_on

Usage:
    python stage_1_extract.py [--first-run]
    
    --first-run: Extract ALL orders (ignore watermark)
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from src.postgres_extract import extract_orders, PostgresExtractError
from src.watermark import load_watermark
from src.config import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    WATERMARK_FILE,
)

def main():
    parser = argparse.ArgumentParser(description="STAGE 1: Extract orders from Postgres")
    parser.add_argument("--first-run", action="store_true", help="Extract all orders (ignore watermark)")
    args = parser.parse_args()
    
    print("=" * 80)
    print("STAGE 1: EXTRACT - Get orders from Postgres (trading_db)")
    print("=" * 80)
    print()
    
    # Load watermark
    watermark = load_watermark(WATERMARK_FILE)
    
    if args.first_run:
        print("[WATERMARK] --first-run specified, extracting ALL orders")
        watermark = None
    elif watermark is None:
        print("[WATERMARK] No watermark found - extracting ALL orders (first time)")
    else:
        print(f"[WATERMARK] Loading orders since: {watermark}")
    
    print()
    
    # Extract
    print("[EXTRACT] Connecting to Postgres...")
    print(f"  Host: {POSTGRES_HOST}:{POSTGRES_PORT}")
    print(f"  Database: {POSTGRES_DB}")
    print(f"  User: {POSTGRES_USER}")
    print()
    
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
    
    # Show columns and sample
    print(f"Columns: {list(orders_df.columns)}")
    print()
    
    if len(orders_df) > 0:
        print("Sample rows:")
        print("-" * 100)
        for _, row in orders_df.head(5).iterrows():
            created = pd.Timestamp(row['created_on']).strftime("%Y-%m-%d %H:%M")
            print(f"  {row['source_order_id']:8} | {row['account_id']:12} | {row['symbol']:6} | qty={row['quantity']:3d} | price=${row['limit_price']:8.2f} | {row['status']:8} | {created}")
        print("-" * 100)
    
    print()
    print("=" * 80)
    print("STAGE 1 COMPLETE: Extracted data ready for transformation")
    print("=" * 80)
    print()
    print("Next step:")
print("  python pipelines/stage_2_transform.py")

if __name__ == "__main__":
    main()
