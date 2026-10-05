from pathlib import Path
import os

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ANALYTICS_ROOT = Path(__file__).resolve().parent

MAX_API_RETRIES = 2
RETRY_BACKOFF_SECONDS = 1

load_dotenv(PROJECT_ROOT / ".env")

FAUXNANCE_BASE_URL = os.getenv("FAUXNANCE_BASE_URL", "").rstrip("/")
FAUXNANCE_API_KEY = os.getenv("FAUXNANCE_API_KEY", "")

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