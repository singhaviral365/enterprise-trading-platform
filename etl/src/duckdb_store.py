from pathlib import Path
from datetime import datetime, timezone

import duckdb
import pandas as pd

from .config import DUCKDB_DB_PATH, SCHEMA_PATH

# Absolute so callers get the same defaults regardless of process cwd.
DEFAULT_DB_PATH = DUCKDB_DB_PATH
DEFAULT_SCHEMA_PATH = SCHEMA_PATH


class AnalyticalStoreError(RuntimeError):
    """Raised when the analytical store cannot be created or loaded."""


def create_analytical_store(
    db_path: Path = DEFAULT_DB_PATH,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
) -> None:
    """
    Create the DuckDB analytical store and apply the supplied schema.

    The database file is created locally. It is not committed to Git.
    """

    db_path = Path(db_path)
    schema_path = Path(schema_path)

    if not schema_path.exists():
        raise AnalyticalStoreError(
            f"Analytics schema not found: {schema_path}"
        )

    db_path.parent.mkdir(parents=True, exist_ok=True)

    schema_sql = schema_path.read_text(encoding="utf-8")

    try:
        con = duckdb.connect(str(db_path))

        try:
            con.execute(schema_sql)
        finally:
            con.close()

    except duckdb.Error as exc:
        raise AnalyticalStoreError(
            f"Failed to create analytical store: {exc}"
        ) from exc


def load_dim_date(
    con: duckdb.DuckDBPyConnection,
    start_date,
    end_date,
) -> None:
    """
    Populate DIM_DATE for every calendar day in the supplied range.

    Existing dates are left unchanged, making the operation safe to repeat.
    """

    dates = pd.date_range(
        start=pd.Timestamp(start_date),
        end=pd.Timestamp(end_date),
        freq="D",
    )

    rows = []

    for date in dates:
        rows.append(
            (
                int(date.strftime("%Y%m%d")),
                date.date(),
                date.day,
                date.month,
                date.year,
                ((date.month - 1) // 3) + 1,
                date.isoweekday(),
                date.day_name(),
                date.month_name(),
                date.weekday() < 5,
            )
        )

    if not rows:
        return

    con.executemany(
        """
        INSERT INTO dim_date (
            date_key,
            full_date,
            day,
            month,
            year,
            quarter,
            day_of_week,
            day_name,
            month_name,
            is_weekday
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1
            FROM dim_date
            WHERE date_key = ?
        )
        """,
        [
            row + (row[0],)
            for row in rows
        ],
    )


def load_dim_instrument(
    con: duckdb.DuckDBPyConnection,
    instruments: pd.DataFrame,
) -> None:
    """
    Load instrument records into DIM_INSTRUMENT.

    Expected input columns:

        symbol
        name
        asset_class
        currency

    Optional:

        exchange
        tradable
    """

    required = {
        "symbol",
        "name",
        "asset_class",
        "currency",
    }

    missing = required - set(instruments.columns)

    if missing:
        raise AnalyticalStoreError(
            f"Missing DIM_INSTRUMENT columns: {sorted(missing)}"
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for _, row in instruments.iterrows():
        symbol = str(row["symbol"])

        exchange = row.get("exchange")

        if pd.isna(exchange):
            exchange = derive_exchange(symbol)

        tradable = row.get("tradable", True)

        if pd.isna(tradable):
            tradable = True

        existing = con.execute(
            """
            SELECT instrument_key
            FROM dim_instrument
            WHERE symbol = ?
            """,
            [symbol],
        ).fetchone()

        if existing:
            con.execute(
                """
                UPDATE dim_instrument
                SET
                    name = ?,
                    asset_class = ?,
                    currency = ?,
                    exchange = ?,
                    tradable = ?,
                    loaded_at = ?
                WHERE symbol = ?
                """,
                [
                    row["name"],
                    row["asset_class"],
                    row["currency"],
                    exchange,
                    bool(tradable),
                    now,
                    symbol,
                ],
            )
        else:
            next_key = get_next_key(con, "dim_instrument", "instrument_key")

            con.execute(
                """
                INSERT INTO dim_instrument (
                    instrument_key,
                    symbol,
                    name,
                    asset_class,
                    currency,
                    exchange,
                    tradable,
                    loaded_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    next_key,
                    symbol,
                    row["name"],
                    row["asset_class"],
                    row["currency"],
                    exchange,
                    bool(tradable),
                    now,
                ],
            )


def derive_exchange(symbol: str) -> str | None:
    """Derive exchange from the Fauxnance symbol convention."""

    symbol = symbol.upper()

    if symbol.endswith(".NS"):
        return "NSE"

    if symbol.endswith(".BO"):
        return "BSE"

    if symbol.startswith("FX:"):
        return "FX"

    if symbol.startswith("X:"):
        return "CRYPTO"

    return "US"


def load_dim_account(
    con: duckdb.DuckDBPyConnection,
    accounts: pd.DataFrame,
) -> None:
    """
    Load account records into DIM_ACCOUNT as Type 2 SCD.
    
    Type 2: When an account changes status, close the previous version
    and insert a new one. This preserves history.
    
    Expected input columns:
        account_id
        holder_name
        status
        effective_date (date of this version)
    
    Optional:
        source_id (operational accounts.id)
    """
    
    required = {
        "account_id",
        "holder_name",
        "status",
        "effective_date",
    }
    
    missing = required - set(accounts.columns)
    
    if missing:
        raise AnalyticalStoreError(
            f"Missing DIM_ACCOUNT columns: {sorted(missing)}"
        )
    
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    for _, row in accounts.iterrows():
        account_id = str(row["account_id"])
        status = str(row["status"]).upper()
        effective_date = pd.Timestamp(row["effective_date"]).date()
        holder_name = str(row["holder_name"])
        source_id = int(row.get("source_id", 0)) if not pd.isna(row.get("source_id")) else 0
        
        # Check if this account_id, status, effective_date combination exists
        existing = con.execute(
            """
            SELECT account_key
            FROM dim_account
            WHERE account_id = ? AND status = ? AND effective_date = ?
            """,
            [account_id, status, effective_date],
        ).fetchone()
        
        if existing:
            # Already loaded, skip
            continue
        
        # Check if there's a current version to close
        current = con.execute(
            """
            SELECT account_key
            FROM dim_account
            WHERE account_id = ? AND is_current = TRUE
            """,
            [account_id],
        ).fetchone()
        
        if current:
            # Close the previous version
            con.execute(
                """
                UPDATE dim_account
                SET is_current = FALSE, end_date = ?
                WHERE account_key = ?
                """,
                [effective_date, current[0]],
            )
        
        # Insert new version
        next_key = get_next_key(con, "dim_account", "account_key")
        
        con.execute(
            """
            INSERT INTO dim_account (
                account_key,
                account_id,
                holder_name,
                status,
                effective_date,
                end_date,
                is_current,
                source_id,
                loaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                next_key,
                account_id,
                holder_name,
                status,
                effective_date,
                None,  # end_date is NULL for current version
                True,  # is_current is TRUE for new version
                source_id,
                now,
            ],
        )


def load_fact_trades(
    con: duckdb.DuckDBPyConnection,
    facts: pd.DataFrame,
) -> int:
    """
    Load fact trade records into FACT_TRADES idempotently.
    
    Uses MERGE (upsert) on the natural key source_order_id to ensure
    re-running a load does not double-count.
    
    Expected input columns:
        source_order_id
        account_key
        instrument_key
        date_key
        side
        quantity
        price
        status
        executed_price (nullable)
        trade_value
        created_at
    
    Returns:
        Number of rows loaded or updated.
    """
    
    required = {
        "source_order_id",
        "account_key",
        "instrument_key",
        "date_key",
        "side",
        "quantity",
        "price",
        "status",
        "trade_value",
        "created_at",
    }
    
    missing = required - set(facts.columns)
    
    if missing:
        raise AnalyticalStoreError(
            f"Missing FACT_TRADES columns: {sorted(missing)}"
        )
    
    if facts.empty:
        return 0
    
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    rows_loaded = 0
    
    for _, row in facts.iterrows():
        source_order_id = str(row["source_order_id"])
        account_key = int(row["account_key"])
        instrument_key = int(row["instrument_key"])
        date_key = int(row["date_key"])
        side = str(row["side"]).upper()
        quantity = int(row["quantity"])
        price = float(row["price"])
        status = str(row["status"]).upper()
        trade_value = float(row["trade_value"])
        created_at = pd.Timestamp(row["created_at"])
        executed_price = float(row["executed_price"]) if not pd.isna(row.get("executed_price")) else None
        
        # Check if this order already exists
        existing = con.execute(
            """
            SELECT trade_key
            FROM fact_trades
            WHERE source_order_id = ?
            """,
            [source_order_id],
        ).fetchone()
        
        if existing:
            # Update existing row
            con.execute(
                """
                UPDATE fact_trades
                SET
                    account_key = ?,
                    instrument_key = ?,
                    date_key = ?,
                    side = ?,
                    quantity = ?,
                    price = ?,
                    status = ?,
                    executed_price = ?,
                    trade_value = ?,
                    loaded_at = ?
                WHERE source_order_id = ?
                """,
                [
                    account_key,
                    instrument_key,
                    date_key,
                    side,
                    quantity,
                    price,
                    status,
                    executed_price,
                    trade_value,
                    now,
                    source_order_id,
                ],
            )
        else:
            # Insert new row
            next_key = get_next_key(con, "fact_trades", "trade_key")
            
            con.execute(
                """
                INSERT INTO fact_trades (
                    trade_key,
                    account_key,
                    instrument_key,
                    date_key,
                    side,
                    quantity,
                    price,
                    status,
                    executed_price,
                    trade_value,
                    source_order_id,
                    created_at,
                    loaded_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    next_key,
                    account_key,
                    instrument_key,
                    date_key,
                    side,
                    quantity,
                    price,
                    status,
                    executed_price,
                    trade_value,
                    source_order_id,
                    created_at,
                    now,
                ],
            )
        
        rows_loaded += 1
    
    return rows_loaded


def get_dimension_keys(con: duckdb.DuckDBPyConnection) -> dict:
    """
    Retrieve all dimension keys for validation lookups.
    
    Returns:
        Dict with keys:
            account_keys: {account_id -> account_key}
            instrument_keys: {symbol -> instrument_key}
            date_keys: set of date_key values
    """
    
    # Get current account keys
    account_rows = con.execute(
        """
        SELECT account_id, account_key
        FROM dim_account
        WHERE is_current = TRUE
        """
    ).fetchall()
    
    account_keys = {str(row[0]): int(row[1]) for row in account_rows}
    
    # Get instrument keys
    instrument_rows = con.execute(
        """
        SELECT symbol, instrument_key
        FROM dim_instrument
        WHERE tradable = TRUE
        """
    ).fetchall()
    
    instrument_keys = {str(row[0]).upper(): int(row[1]) for row in instrument_rows}
    
    # Get date keys
    date_rows = con.execute(
        """
        SELECT date_key
        FROM dim_date
        """
    ).fetchall()
    
    date_keys = {int(row[0]) for row in date_rows}
    
    return {
        'account_keys': account_keys,
        'instrument_keys': instrument_keys,
        'date_keys': date_keys,
    }


def get_instrument_symbol_map(con: duckdb.DuckDBPyConnection) -> dict:
    """
    Get a mapping of instrument_id from Postgres to symbol for lookups.
    
    This is populated during the extract phase and stored temporarily.
    
    Returns:
        Dict mapping instrument_id (as string) -> symbol
    """
    # This would be populated from the extracted data
    # For now, we'll return an empty dict and populate it during load
    return {}


def get_existing_order_ids(con: duckdb.DuckDBPyConnection) -> set:
    """
    Get the set of source_order_ids already loaded in fact_trades.
    
    Returns:
        Set of source_order_id strings.
    """
    
    rows = con.execute(
        """
        SELECT source_order_id
        FROM fact_trades
        """
    ).fetchall()
    
    return {str(row[0]) for row in rows}


def get_next_key(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    key_column: str,
) -> int:
    """Return the next surrogate key for a dimension."""

    result = con.execute(
        f"""
        SELECT COALESCE(MAX({key_column}), 0) + 1
        FROM {table_name}
        """
    ).fetchone()

    return int(result[0])


def open_analytical_store(
    db_path: Path = DEFAULT_DB_PATH,
) -> duckdb.DuckDBPyConnection:
    """Open an existing analytical store."""

    db_path = Path(db_path)

    if not db_path.exists():
        raise AnalyticalStoreError(
            f"Analytical store does not exist: {db_path}"
        )

    return duckdb.connect(str(db_path))


if __name__ == "__main__":
    create_analytical_store()

    print(
        f"Analytical store created at {DEFAULT_DB_PATH}"
    )