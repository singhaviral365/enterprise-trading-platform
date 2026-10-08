from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ANALYTICS_ROOT = Path(__file__).resolve().parent

MAX_API_RETRIES = 2
RETRY_BACKOFF_SECONDS = 1

def _central(path, default=""):
    """A value from config/application.yml (config/application.example.yml when it is missing); see config/README.md."""
    import yaml

    folder = PROJECT_ROOT / "config"
    merged = {}
    for name in ("application.example.yml", "application.yml"):
        file = folder / name
        if file.exists():
            merged = _merge(merged, yaml.safe_load(file.read_text(encoding="utf8")) or {})
    node = merged
    for key in path.split("."):
        node = node.get(key) if isinstance(node, dict) else None
    return default if node is None or node == "" else str(node)


def _merge(base, over):
    if not isinstance(over, dict):
        return over
    out = dict(base) if isinstance(base, dict) else {}
    for key, value in over.items():
        out[key] = _merge(out.get(key), value)
    return out



FAUXNANCE_BASE_URL = _central("external.fauxnance.base-url").rstrip("/")
FAUXNANCE_API_KEY = _central("external.fauxnance.api-key")

CANDLES_ENDPOINT = "/candles/{symbol}"

API_TIMEOUT_SECONDS = 10

MOCK_DATA_DIR = ANALYTICS_ROOT / "mock_data"
OUTPUT_DIR = ANALYTICS_ROOT / "output"
CANDLES_OUTPUT_DIR = OUTPUT_DIR / "candles"
QUARANTINE_OUTPUT_DIR = OUTPUT_DIR / "quarantine"
CACHE_DIR = ANALYTICS_ROOT / "cache"

OUTPUT_FORMAT = "csv"

REQUIRED_COLUMNS = [
    "date",
    "open",
    "high",
    "low",
    "close",
    "adjclose",
    "volume",
    "synthetic",
]

NUMERIC_COLUMNS = [
    "open",
    "high",
    "low",
    "close",
    "adjclose",
    "volume",
]

BOOLEAN_COLUMNS = [
    "synthetic",
]

FINAL_COLUMN_ORDER = [
    "date",
    "open",
    "high",
    "low",
    "close",
    "adjclose",
    "volume",
    "synthetic",
]

ALLOW_API_FALLBACK = True

DEFAULT_SYMBOL = "RELIANCE.NS"
DEFAULT_FROM_DATE = "2026-07-01"
DEFAULT_TO_DATE = "2026-07-31"
DEFAULT_INTERVAL = "1d"
DEFAULT_FIXTURE =  MOCK_DATA_DIR / "candles-reliance-ns-2026-07.json"