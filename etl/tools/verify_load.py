#!/usr/bin/env python3
"""
Verification script: Query the DuckDB analytics database to inspect loaded data

Usage:
    python verify_load.py [query_type]
    
    query_type options:
      - summary (default): Show summary statistics
      - facts: Show all FACT_TRADES rows
      - dimensions: Show all dimension tables
      - recent: Show recent facts with full details
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.duckdb_store import open_analytical_store
from src.config import DUCKDB_DB_PATH
import pandas as pd

def print_section(title: str):
    """Print formatted section."""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80 + "\n")

def query_summary(con):
    """Show database summary."""
    
    print_section("DATABASE SUMMARY")
    
    # Count rows in each table
    tables = {
        'dim_date': 'dim_date',
        'dim_instrument': 'dim_instrument',
        'dim_account (current)': 'dim_account WHERE is_current = TRUE',
        'dim_account (all versions)': 'dim_account',
        'fact_trades': 'fact_trades',
    }
    
    print("Table row counts:")
    for name, query in tables.items():
        result = con.execute(f"SELECT COUNT(*) FROM {query}").fetchone()[0]
        print(f"  {name:30} : {result:6d} rows")
    
    print("\n" + "-"*80)
    print("Orders by status:")
    print("-"*80 + "\n")
    
    status_summary = con.execute("""
        SELECT status, COUNT(*) as count, SUM(quantity) as total_qty, SUM(trade_value) as total_value
        FROM fact_trades
        GROUP BY status
        ORDER BY status
    """).fetchall()
    
    if not status_summary:
        print("  (no data loaded)\n")
    else:
        for status, count, total_qty, total_value in status_summary:
            print(f"  {status:10} : {count:3d} orders | qty={total_qty:6d} | value=${total_value:12,.2f}")
        print()

def query_facts(con):
    """Show all FACT_TRADES rows."""
    
    print_section("FACT_TRADES (All Rows)")
    
    results = con.execute("""
        SELECT 
            ft.source_order_id,
            ft.side,
            ft.quantity,
            ft.price,
            ft.trade_value,
            ft.status,
            da.account_id,
            di.symbol,
            ft.created_at
        FROM fact_trades ft
        JOIN dim_account da ON ft.account_key = da.account_key
        JOIN dim_instrument di ON ft.instrument_key = di.instrument_key
        ORDER BY ft.created_at DESC
    """).fetchall()
    
    if not results:
        print("  (no data loaded)\n")
        return
    
    df = pd.DataFrame(results, columns=['Order ID', 'Side', 'Qty', 'Price', 'Trade Value', 'Status', 'Account', 'Symbol', 'Created At'])
    
    # Format display
    print(df.to_string(index=False))
    print()

def query_dimensions(con):
    """Show dimension tables."""
    
    print_section("DIMENSION TABLES")
    
    # DIM_INSTRUMENT
    print("\nDIM_INSTRUMENT:")
    print("-"*80)
    instr = con.execute("""
        SELECT symbol, name, asset_class, currency, exchange, tradable
        FROM dim_instrument
        ORDER BY symbol
    """).fetchall()
    
    if instr:
        df = pd.DataFrame(instr, columns=['Symbol', 'Name', 'Asset Class', 'Currency', 'Exchange', 'Tradable'])
        print(df.to_string(index=False))
    else:
        print("  (empty)")
    print()
    
    # DIM_ACCOUNT (current)
    print("\nDIM_ACCOUNT (Current Versions):")
    print("-"*80)
    accts = con.execute("""
        SELECT account_id, holder_name, status, effective_date, is_current
        FROM dim_account
        WHERE is_current = TRUE
        ORDER BY account_id
    """).fetchall()
    
    if accts:
        df = pd.DataFrame(accts, columns=['Account ID', 'Holder Name', 'Status', 'Effective Date', 'Current'])
        print(df.to_string(index=False))
    else:
        print("  (empty)")
    print()

def query_recent(con):
    """Show recent facts with all details."""
    
    print_section("RECENT FACTS (Most Recent First)")
    
    results = con.execute("""
        SELECT 
            ft.trade_key,
            ft.source_order_id,
            da.account_id,
            di.symbol,
            ft.side,
            ft.quantity,
            ft.price,
            ft.executed_price,
            ft.trade_value,
            ft.status,
            ft.created_at,
            ft.loaded_at
        FROM fact_trades ft
        JOIN dim_account da ON ft.account_key = da.account_key
        JOIN dim_instrument di ON ft.instrument_key = di.instrument_key
        ORDER BY ft.created_at DESC
        LIMIT 20
    """).fetchall()
    
    if not results:
        print("  (no data loaded)\n")
        return
    
    print("Recent 20 facts:\n")
    for row in results:
        trade_key, source_id, account, symbol, side, qty, price, exec_price, trade_val, status, created, loaded = row
        print(f"Order {source_id}:")
        print(f"  Account:       {account}")
        print(f"  Symbol:        {symbol}")
        print(f"  Side:          {side} {qty} @ ${price:.2f}")
        print(f"  Executed at:   ${exec_price:.2f}" if exec_price else "  Executed at:   (not filled)")
        print(f"  Trade Value:   ${trade_val:,.2f}")
        print(f"  Status:        {status}")
        print(f"  Created:       {created}")
        print(f"  Loaded:        {loaded}")
        print()

def main():
    """Main verification routine."""
    
    if not DUCKDB_DB_PATH.exists():
        print(f"\n✗ Database not found: {DUCKDB_DB_PATH}")
        print("   Run: python run_incremental_load.py --first-run\n")
        sys.exit(1)
    
    con = open_analytical_store(DUCKDB_DB_PATH)
    
    try:
        query_type = sys.argv[1] if len(sys.argv) > 1 else "summary"
        
        if query_type == "summary":
            query_summary(con)
        elif query_type == "facts":
            query_facts(con)
        elif query_type == "dimensions":
            query_dimensions(con)
        elif query_type == "recent":
            query_recent(con)
        else:
            print(f"\nUnknown query type: {query_type}")
            print("Valid types: summary, facts, dimensions, recent\n")
            sys.exit(1)
    
    finally:
        con.close()

if __name__ == "__main__":
    main()
