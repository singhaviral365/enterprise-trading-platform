from dataclasses import dataclass
import json
import logging
from pathlib import Path
import time
import requests
from analytics.config import ALLOW_API_FALLBACK, API_TIMEOUT_SECONDS, CANDLES_ENDPOINT, CACHE_DIR, FAUXNANCE_API_KEY, FAUXNANCE_BASE_URL, MAX_API_RETRIES, RETRY_BACKOFF_SECONDS
logger = logging.getLogger(__name__)

@dataclass
class ExtractResult:
    """Raw extracted response and its provenance"""
    payload: dict
    source: str
    symbol: str
    from_date: str
    to_date: str
    interval: str

class ExtractionError(RuntimeError):
    """Raised when candle data cannot be extracted"""

class RateLimitError(ExtractionError):
    """Raised when the Fauxnance daily quota is exhausted"""

    def __init__(self, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.retry_after = retry_after

class SymbolRequestError(ExtractionError):
    """Raised when a symbol request fails with a client error"""

class UpstreamUnavailableError(ExtractionError):
    """Raised when Fauxnance cannot be reached"""

def extract(symbol: str, from_date: str, to_date: str, fixture_path: Path, interval: str = "1d") -> ExtractResult:
    """Obtain a raw candle response from cache, API, or fixture"""

    cached_payload = load_cached_response(symbol=symbol, from_date=from_date, to_date=to_date, interval=interval)

    if cached_payload is not None:
        logger.info("Using cached candles: symbol=%s from=%s to=%s", symbol, from_date, to_date)
        return ExtractResult(payload=cached_payload, source="cache", symbol=symbol, from_date=from_date, to_date=to_date, interval=interval,)

    if api_is_configured():
        try:
            check_health()
            check_usage()
            payload = fetch_from_api(symbol=symbol, from_date=from_date, to_date=to_date, interval=interval,)
            save_cached_response(symbol=symbol, from_date=from_date, to_date=to_date, interval=interval, payload=payload)
            return ExtractResult(payload=payload, source="api", symbol=symbol, from_date=from_date, to_date=to_date, interval=interval)
        except RateLimitError:
            raise
        except SymbolRequestError as exc:
            logger.error("Symbol request failed: symbol=%s error=%s", symbol, exc)
            if not ALLOW_API_FALLBACK:
                raise
        except UpstreamUnavailableError as exc:
            logger.warning("Fauxnance unavailable: symbol=%s error=%s", symbol, exc)
            if not ALLOW_API_FALLBACK:
                raise
        except ExtractionError as exc:
            logger.error("API extraction failed: symbol=%s error=%s", symbol, exc)
            if not ALLOW_API_FALLBACK:
                raise

    payload = load_fixture(fixture_path)
    logger.info("Using fixture: symbol=%s fixture=%s", symbol, fixture_path,)
    return ExtractResult(payload=payload, source="fixture", symbol=symbol, from_date=from_date, to_date=to_date, interval=interval)

def api_is_configured() -> bool:
    """Return whether the Fauxnance URL and API key are configured"""
    return bool(FAUXNANCE_BASE_URL and FAUXNANCE_API_KEY)

def check_health() -> dict:
    """Check Fauxnance service health without consuming a key quota unit"""

    url = f"{FAUXNANCE_BASE_URL}/health"

    try:
        response = requests.get(url, timeout=API_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise UpstreamUnavailableError(f"Fauxnance health check failed: {exc}") from exc

    if response.status_code != 200:
        raise UpstreamUnavailableError(f"Fauxnance health check returned HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise UpstreamUnavailableError("Fauxnance health check returned invalid JSON.") from exc

    status = payload.get("data", {}).get("status")
    logger.info("Fauxnance health status: %s", status)
    return payload


def check_usage() -> dict:
    """Check the current API-key quota before requesting candles"""

    url = f"{FAUXNANCE_BASE_URL}/usage"
    headers = {
        "X-Api-Key": FAUXNANCE_API_KEY,
        "Accept": "application/json",
    }

    try:
        response = requests.get(url, headers=headers, timeout=API_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise UpstreamUnavailableError(f"Fauxnance usage check failed: {exc}") from exc

    if response.status_code == 429:
        retry_after = retry_after_seconds(response)
        raise RateLimitError("Fauxnance daily quota is exhausted.", retry_after=retry_after,)

    if response.status_code in {401, 403}:
        raise ExtractionError(f"Fauxnance usage authentication failed: HTTP {response.status_code}")

    if response.status_code != 200:
        raise ExtractionError(f"Fauxnance usage request failed: HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise ExtractionError("Fauxnance usage endpoint returned invalid JSON.") from exc

    return payload

def fetch_from_api(symbol: str, from_date: str, to_date: str, interval: str) -> dict:
    """Fetch a raw CandlesResponse from Fauxnance"""

    url = f"{FAUXNANCE_BASE_URL}{CANDLES_ENDPOINT.format(symbol=symbol)}"
    headers = {
        "X-Api-Key": FAUXNANCE_API_KEY,
        "Accept": "application/json",
    }
    params = {
        "from": from_date,
        "to": to_date,
        "interval": interval,
    }

    for attempt in range(MAX_API_RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=API_TIMEOUT_SECONDS)
        except requests.Timeout as exc:
            if attempt >= MAX_API_RETRIES:
                raise UpstreamUnavailableError(f"Fauxnance request timed out after {MAX_API_RETRIES + 1} attempts.") from exc
            backoff(attempt)
            continue
        except requests.ConnectionError as exc:
            if attempt >= MAX_API_RETRIES:
                raise UpstreamUnavailableError(f"Fauxnance connection failed after {MAX_API_RETRIES + 1} attempts.") from exc
            backoff(attempt)
            continue
        except requests.RequestException as exc:
            raise UpstreamUnavailableError(f"Fauxnance request failed: {exc}") from exc

        if response.status_code == 429:
            retry_after = retry_after_seconds(response)
            logger.error("Fauxnance rate limit reached: symbol=%s retry_after=%s", symbol, retry_after)
            raise RateLimitError("Fauxnance daily quota is exhausted.", retry_after=retry_after)

        if 400 <= response.status_code < 500:
            raise SymbolRequestError(f"Fauxnance rejected symbol={symbol}: HTTP {response.status_code} {response.text}")

        if response.status_code >= 500:
            if attempt >= MAX_API_RETRIES:
                raise UpstreamUnavailableError(f"Fauxnance server error after {MAX_API_RETRIES + 1} attempts: HTTP {response.status_code}")
            backoff(attempt)
            continue

        if response.status_code != 200:
            raise UpstreamUnavailableError(f"Unexpected Fauxnance response: HTTP {response.status_code}")

        try:
            return response.json()
        except ValueError as exc:
            raise ExtractionError("Fauxnance returned invalid JSON.") from exc

    raise UpstreamUnavailableError(f"Fauxnance request failed for symbol={symbol}.")

def load_fixture(fixture_path: Path) -> dict:
    """Load an unchanged CandlesResponse payload from a fixture"""
    if not fixture_path.exists():
        raise ExtractionError(f"Fixture does not exist: {fixture_path}")
    try:
        with fixture_path.open("r", encoding="utf-8",) as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise ExtractionError(f"Unable to load fixture: {fixture_path}") from exc

def load_cached_response(symbol: str, from_date: str, to_date: str, interval: str) -> dict | None:
    """Load a previously cached raw API response if available"""

    cache_path = cache_path_for(symbol=symbol, from_date=from_date, to_date=to_date, interval=interval)
    if not cache_path.exists():
        return None

    try:
        with cache_path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring invalid cache file: %s", cache_path)
        return None

def save_cached_response(symbol: str, from_date: str, to_date: str, interval: str, payload: dict) -> Path:
    """Save the raw API response to the extraction cache"""

    cache_path = cache_path_for(symbol=symbol, from_date=from_date, to_date=to_date, interval=interval,)
    cache_path.parent.mkdir(parents=True, exist_ok=True,)

    with cache_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)

    return cache_path

def cache_path_for(symbol: str, from_date: str, to_date: str, interval: str) -> Path:
    """Return the deterministic cache path for a candle request"""

    safe_symbol = symbol.replace("/", "_").replace("\\", "_").replace(":", "_")
    filename = f"{safe_symbol}_{from_date}_{to_date}_{interval}.json"
    return CACHE_DIR / filename

def retry_after_seconds(response: requests.Response,) -> int | None:
    """Read Retry-After from an API response"""
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None

def backoff(attempt: int) -> None:
    """Wait using exponential backoff"""

    delay = RETRY_BACKOFF_SECONDS * (2 ** attempt)
    time.sleep(delay)