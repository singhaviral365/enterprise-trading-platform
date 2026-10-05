"""Extract orders and dimensions from Postgres."""

import logging
from datetime import datetime

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class PostgresExtractError(RuntimeError):
    """Raised when Postgres extraction fails."""


def extract_orders(
    host: str,
    port: int,
    db: str,
    user: str,
    password: str,
    since: datetime | None = None,
) -> pd.DataFrame:
    """
    Extract orders from Postgres since a given timestamp.
    
    Maps trading_db schema to analytics schema:
    - order_id -> source_order_id
    - order_status -> status
    - received_at -> created_on (order creation timestamp)
    - order_type -> side (BUY/SELL)
    - price -> limit_price
    - account.account_number -> account_id (business key)
    - instrument.instrument_ticker -> symbol
    
    Args:
        host: Postgres server hostname.
        port: Postgres server port.
        db: Database name.
        user: Database user.
        password: Database password.
        since: Optional datetime to filter orders created after this timestamp.
               If None, extracts all orders.
    
    Returns:
        DataFrame with columns: source_order_id, account_id, symbol, 
                                side, quantity, limit_price, status, created_on
    """
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=db,
            user=user,
            password=password,
        )
        logger.info(
            "Connected to Postgres: %s:%s/%s",
            host,
            port,
            db,
        )
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to connect to Postgres: {exc}") from exc
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if since is None:
                query = """
                    SELECT
                        o.order_id,
                        a.account_number as account_id,
                        i.instrument_ticker as symbol,
                        o.order_type as side,
                        o.quantity,
                        o.price as limit_price,
                        o.order_status as status,
                        o.received_at as created_on,
                        o.transaction_date as executed_on
                    FROM orders o
                    JOIN account a ON o.account_id = a.account_id
                    JOIN instrument i ON o.instrument_id = i.instrument_id
                    ORDER BY o.received_at ASC
                """
                logger.info("Extracting all orders")
                cur.execute(query)
            else:
                query = """
                    SELECT
                        o.order_id,
                        a.account_number as account_id,
                        i.instrument_ticker as symbol,
                        o.order_type as side,
                        o.quantity,
                        o.price as limit_price,
                        o.order_status as status,
                        o.received_at as created_on,
                        o.transaction_date as executed_on
                    FROM orders o
                    JOIN account a ON o.account_id = a.account_id
                    JOIN instrument i ON o.instrument_id = i.instrument_id
                    WHERE o.received_at > %s
                    ORDER BY o.received_at ASC
                """
                logger.info("Extracting orders since %s", since)
                cur.execute(query, (since,))
            
            rows = cur.fetchall()
            logger.info("Extracted %d orders", len(rows))
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame([dict(row) for row in rows])
            # Rename order_id to source_order_id for consistency
            df['source_order_id'] = df['order_id'].astype(str)
            df = df.drop('order_id', axis=1)
            return df
    
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to query orders: {exc}") from exc
    
    finally:
        conn.close()


def extract_instruments(
    host: str,
    port: int,
    db: str,
    user: str,
    password: str,
) -> pd.DataFrame:
    """
    Extract instruments from Postgres.
    
    Maps trading_db schema to analytics schema:
    - instrument_ticker -> symbol
    - instrument_name -> name
    - asset_class -> asset_class
    
    Returns:
        DataFrame with columns: symbol, name, asset_class, currency
    """
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=db,
            user=user,
            password=password,
        )
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to connect to Postgres: {exc}") from exc
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT
                    instrument_id,
                    instrument_ticker as symbol,
                    instrument_name as name,
                    asset_class,
                    'USD' as currency
                FROM instrument
                ORDER BY instrument_id ASC
            """
            logger.info("Extracting instruments")
            cur.execute(query)
            
            rows = cur.fetchall()
            logger.info("Extracted %d instruments", len(rows))
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame([dict(row) for row in rows])
            return df
    
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to query instruments: {exc}") from exc
    
    finally:
        conn.close()


def extract_accounts(
    host: str,
    port: int,
    db: str,
    user: str,
    password: str,
) -> pd.DataFrame:
    """
    Extract accounts from Postgres.
    
    Maps trading_db schema to analytics schema:
    - account_number -> account_id (business key)
    - account_id -> source_id (operational key)
    
    Returns:
        DataFrame with columns: account_id, holder_name, status, effective_date, source_id
    """
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=db,
            user=user,
            password=password,
        )
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to connect to Postgres: {exc}") from exc
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT
                    a.account_id as source_id,
                    a.account_number as account_id,
                    c.client_name as holder_name,
                    a.account_status as status,
                    a.opening_date::date as effective_date
                FROM account a
                JOIN client c ON a.client_id = c.client_id
                ORDER BY a.account_id ASC
            """
            logger.info("Extracting accounts")
            cur.execute(query)
            
            rows = cur.fetchall()
            logger.info("Extracted %d accounts", len(rows))
            
            if not rows:
                return pd.DataFrame()
            
            df = pd.DataFrame([dict(row) for row in rows])
            return df
    
    except psycopg2.Error as exc:
        raise PostgresExtractError(f"Failed to query accounts: {exc}") from exc
    
    finally:
        conn.close()
