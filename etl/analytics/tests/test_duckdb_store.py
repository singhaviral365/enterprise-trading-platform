import duckdb
import pandas as pd

from analytics.duckdb_store import (
    create_analytical_store,
    derive_exchange,
    load_dim_date,
    load_dim_instrument,
)
from analytics.config import ANALYTICS_ROOT


# Absolute so the test passes regardless of the process cwd it is run from.
SCHEMA_PATH = ANALYTICS_ROOT / "contracts" / "analytics-schema.sql"


def test_create_analytical_store_creates_required_tables(tmp_path):
    db_path = tmp_path / "analytics.duckdb"

    create_analytical_store(
        db_path=db_path,
        schema_path=SCHEMA_PATH,
    )

    con = duckdb.connect(str(db_path))

    tables = {
        row[0]
        for row in con.execute("SHOW TABLES").fetchall()
    }

    con.close()

    assert tables == {
        "dim_account",
        "dim_date",
        "dim_instrument",
        "fact_trades",
    }


def test_load_dim_date_creates_calendar_rows(tmp_path):
    db_path = tmp_path / "analytics.duckdb"

    create_analytical_store(
        db_path=db_path,
        schema_path=SCHEMA_PATH,
    )

    con = duckdb.connect(str(db_path))

    load_dim_date(
        con,
        "2026-07-01",
        "2026-07-03",
    )

    rows = con.execute(
        """
        SELECT
            date_key,
            full_date,
            quarter,
            is_weekday
        FROM dim_date
        ORDER BY full_date
        """
    ).fetchall()

    con.close()

    assert len(rows) == 3
    assert rows[0][0] == 20260701
    assert rows[0][1].strftime("%Y-%m-%d") == "2026-07-01"
    assert rows[0][2] == 3
    assert rows[0][3] is True


def test_load_dim_date_is_idempotent(tmp_path):
    db_path = tmp_path / "analytics.duckdb"

    create_analytical_store(
        db_path=db_path,
        schema_path=SCHEMA_PATH,
    )

    con = duckdb.connect(str(db_path))

    load_dim_date(
        con,
        "2026-07-01",
        "2026-07-03",
    )

    load_dim_date(
        con,
        "2026-07-01",
        "2026-07-03",
    )

    count = con.execute(
        "SELECT COUNT(*) FROM dim_date"
    ).fetchone()[0]

    con.close()

    assert count == 3


def test_derive_exchange():
    assert derive_exchange("INFY.NS") == "NSE"
    assert derive_exchange("TATASTEEL.BO") == "BSE"
    assert derive_exchange("FX:EURUSD") == "FX"
    assert derive_exchange("X:BTCUSD") == "CRYPTO"
    assert derive_exchange("AAPL") == "US"


def test_load_dim_instrument(tmp_path):
    db_path = tmp_path / "analytics.duckdb"

    create_analytical_store(
        db_path=db_path,
        schema_path=SCHEMA_PATH,
    )

    con = duckdb.connect(str(db_path))

    instruments = pd.DataFrame(
        [
            {
                "symbol": "INFY.NS",
                "name": "Infosys Ltd",
                "asset_class": "EQUITY",
                "currency": "INR",
            },
            {
                "symbol": "RELIANCE.NS",
                "name": "Reliance Industries Ltd",
                "asset_class": "EQUITY",
                "currency": "INR",
            },
        ]
    )

    load_dim_instrument(con, instruments)

    rows = con.execute(
        """
        SELECT
            symbol,
            name,
            currency,
            exchange,
            tradable
        FROM dim_instrument
        ORDER BY symbol
        """
    ).fetchall()

    con.close()

    assert len(rows) == 2
    assert rows[0][0] == "INFY.NS"
    assert rows[0][2] == "INR"
    assert rows[0][3] == "NSE"
    assert rows[0][4] is True