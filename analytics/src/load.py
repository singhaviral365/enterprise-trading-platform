from pathlib import Path
import pandas as pd
from analytics.config import CANDLES_OUTPUT_DIR, QUARANTINE_OUTPUT_DIR

def load(dataframe: pd.DataFrame, symbol: str, output_dir: Path = CANDLES_OUTPUT_DIR) -> Path:
    """Write clean candle data to a csv file"""

    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / f"{safe_symbol(symbol)}.csv"
    dataframe.to_csv(output_path, index=False)
    return output_path

def load_quarantine(dataframe: pd.DataFrame, symbol: str, output_dir: Path = QUARANTINE_OUTPUT_DIR) -> Path | None:
    """Write quarantined records to csv when malformed rows exist"""

    if dataframe.empty:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{safe_symbol(symbol)}_quarantine.csv"
    dataframe.to_csv(output_path, index=False)

    return output_path

def safe_symbol(symbol: str) -> str:
    """Convert an API symbol into a filesystem-safe filename"""

    return symbol.replace("/", "_").replace("\\", "_").replace(":", "_")