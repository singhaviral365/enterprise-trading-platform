#!/usr/bin/env python3
"""Test Postgres connectivity and auto-detect correct settings."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2 import OperationalError
from dotenv import load_dotenv
import os

def test_connection(host, port, db, user, password):
    """Try to connect to Postgres."""
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=db,
            user=user,
            password=password,
        )
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM orders")
        order_count = cur.fetchone()[0]
        conn.close()
        return True, order_count
    except OperationalError as e:
        return False, str(e)

def main():
    """Test various connection configurations."""
    
    # Load from .env first
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    db = os.getenv("POSTGRES_DB", "trading_db")
    user = os.getenv("POSTGRES_USER", "postgres")
    env_password = os.getenv("POSTGRES_PASSWORD", "")
    
    # Try different passwords
    passwords = [env_password, "", "postgres", "postgres123", "root", "password", "n3u3d4!"]
    # Remove duplicates
    passwords = list(dict.fromkeys(p for p in passwords if p))
    
    print(f"\nTesting Postgres connection to {user}@{host}:{port}/{db}\n")
    print("Trying passwords (from .env first, then common ones):")
    print("-" * 60)
    
    for pwd in passwords:
        success, result = test_connection(host, port, db, user, pwd)
        pwd_display = f"'{pwd}'" if pwd else "(empty)"
        if success:
            print(f"✓ SUCCESS with password {pwd_display}")
            print(f"  Orders in database: {result}")
            print(f"\nConnection string:")
            print(f"  postgresql://{user}:{pwd}@{host}:{port}/{db}")
            sys.exit(0)
        else:
            error_msg = result.split(':')[-1].strip() if ':' in result else result
            print(f"✗ Failed with password {pwd_display}: {error_msg}")
    
    print("\n✗ Could not connect to Postgres with any tested password")
    print("\nTroubleshooting:")
    print("1. Is Postgres running? (check with: psql -U postgres)")
    print("2. Is database 'trading_db' created?")
    print("3. Try connecting manually:")
    print(f"   psql -U postgres -h {host} -d {db}")
    sys.exit(1)

if __name__ == "__main__":
    main()
