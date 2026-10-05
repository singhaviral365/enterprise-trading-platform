from pathlib import Path
from datetime import datetime, timezone

import duckdb
import pandas as pd

from analytics.config import ANALYTICS_ROOT

# Absolute so callers get the same defaults regardless of process cwd.
DEFAULT_DB_PATH = ANALYTICS_ROOT / "data" / "analytics.duckdb"
DEFAULT_SCHEMA_PATH = ANALYTICS_ROOT / "contracts" / "analytics-schema.sql"


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