from dataclasses import dataclass
import pandas as pd
from analytics.config import FINAL_COLUMN_ORDER, NUMERIC_COLUMNS, REQUIRED_COLUMNS

@dataclass
class TransformResult:
    """Clean and quarantined candle data with response metadata"""
    clean: pd.DataFrame
    quarantined: pd.DataFrame
    symbol: str
    interval: str | None
    currency: str | None
    as_of: str | None
    disclaimer: str | None
    metadata_symbol: str | None
    metadata_source: str | None

class TransformationError(ValueError):
    """Raised when transformation cannot be performed"""

def transform(payload: dict) -> TransformResult:
    """Validate and transform a raw CandlesResponse"""
    
    if not isinstance(payload, dict):
        raise TransformationError("CandlesResponse must be a JSON object.")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise TransformationError("CandlesResponse is missing data.")

    candles = data.get("candles")
    if not isinstance(candles, list):
        raise TransformationError("CandlesResponse data.candles must be a list.")

    meta = payload.get("meta", {})
    if not isinstance(meta, dict):
        meta = {}

    dataframe = pd.DataFrame(candles)
    validate_required_columns(dataframe)

    df = dataframe.copy()

    df["row_number"] = range(len(df))
    df["quarantine_reason"] = None

    normalize_types(df)
    validate_dates(df)
    validate_numeric_values(df)
    validate_ohlc(df)
    validate_volume(df)
    validate_duplicates(df)

    quarantined = df[df["quarantine_reason"].notna()].copy()
    clean = df[df["quarantine_reason"].isna()].copy()

    quarantined = prepare_quarantine(quarantined)
    clean = prepare_clean(clean)

    return TransformResult(
        clean=clean,
        quarantined=quarantined,
        symbol=data.get("symbol"),
        interval=data.get("interval"),
        currency=data.get("currency"),
        as_of=meta.get("asOf"),
        disclaimer=meta.get("disclaimer"),
        metadata_symbol=meta.get("symbol"),
        metadata_source=meta.get("source"),
    )

def validate_required_columns(dataframe: pd.DataFrame) -> None:
    """Ensure the expected candle columns exist"""

    missing = [column for column in REQUIRED_COLUMNS if column not in dataframe.columns]
    if missing:
        raise TransformationError(f"Missing required columns: {missing}")

def normalize_types(df: pd.DataFrame) -> None:
    """Convert candle columns to their expected pandas types"""

    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce",)
    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df["synthetic"] = df["synthetic"].astype("boolean")

def validate_dates(df: pd.DataFrame) -> None:
    """Reject missing or invalid dates"""

    invalid = df["date"].isna()
    mark_invalid(
        df,
        invalid,
        "invalid_date",
    )

def validate_numeric_values(df: pd.DataFrame) -> None:
    """Reject rows with missing required numeric values"""

    required_numeric = [
        "open",
        "high",
        "low",
        "close",
        "adjclose",
    ]
    invalid = df[required_numeric].isna().any(axis=1)
    mark_invalid(df, invalid, "missing_or_invalid_price")

def validate_ohlc(df: pd.DataFrame) -> None:
    """Reject rows violating OHLC price relationships"""

    valid = (
        (df["high"] >= df["open"])
        & (df["high"] >= df["close"])
        & (df["high"] >= df["low"])
        & (df["low"] <= df["open"])
        & (df["low"] <= df["close"])
        & (df["low"] <= df["high"])
    )

    invalid = ~valid
    mark_invalid(df, invalid, "invalid_ohlc_relationship")

def validate_volume(df: pd.DataFrame) -> None:
    """Reject negative volumes while allowing null volume"""

    invalid = df["volume"].notna() & (df["volume"] < 0)
    mark_invalid(df, invalid, "negative_volume")

def validate_duplicates(df: pd.DataFrame) -> None:
    """Quarantine all rows involved in duplicate trading dates"""

    duplicate = df["date"].duplicated(keep=False)
    mark_invalid(df, duplicate, "duplicate_date",)

def mark_invalid(df: pd.DataFrame, mask: pd.Series, reason: str) -> None:
    """Assign a quarantine reason to rows that have not already failed"""

    mask = mask.fillna(False)
    eligible = (mask & df["quarantine_reason"].isna())
    df.loc[eligible, "quarantine_reason"] = reason

def prepare_clean(df: pd.DataFrame) -> pd.DataFrame:
    """Return the final analytics-ready DataFrame"""

    result = df.copy()
    result = result.sort_values("date")
    result = result[FINAL_COLUMN_ORDER].reset_index(drop=True)
    return result

def prepare_quarantine(df: pd.DataFrame) -> pd.DataFrame:
    """Return malformed rows with their quarantine metadata"""

    result = df.copy()
    result = result.sort_values("row_number")
    result = result.rename(
        columns={
            "row_number": "source_row",
            "quarantine_reason": "quarantine_reason",
        }
    )
    return result.reset_index(drop=True)