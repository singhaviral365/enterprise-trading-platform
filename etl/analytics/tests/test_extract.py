import json
import pandas as pd

from analytics.config import DEFAULT_FROM_DATE, DEFAULT_TO_DATE, DEFAULT_INTERVAL, MOCK_DATA_DIR
from analytics.src.extract import ExtractionError, extract

def test_fixture_extraction(tmp_path):
    """Fixture extraction should return the raw CandlesResponse payload"""

    fixture = tmp_path / "candles.json"

    fixture.write_text(
        json.dumps({
            "data": {
                "symbol": "TEST.NS",
                "interval": "1d",
                "currency": "INR",
                "candles": [
                    {
                        "date": "2026-07-01",
                        "open": 100,
                        "high": 110,
                        "low": 95,
                        "close": 105,
                        "adjclose": 105,
                        "volume": 1000,
                        "synthetic": False,
                    }
                ],
            },
            "meta": {
                "asOf": "2026-07-31",
                "disclaimer": "Test",
                "symbol": "TEST.NS",
                "source": "fixture",
            },
        }),
        encoding="utf-8",
    )

    result = extract(
        symbol="TEST.NS",
        from_date=DEFAULT_FROM_DATE,
        to_date=DEFAULT_TO_DATE,
        interval=DEFAULT_INTERVAL,
        fixture_path=fixture,
    )

    assert result.source == "fixture"
    assert result.symbol == "TEST.NS"

    assert isinstance(result.payload, dict)
    assert result.payload["data"]["symbol"] == "TEST.NS"
    assert result.payload["data"]["interval"] == "1d"
    assert result.payload["data"]["currency"] == "INR"
    assert len(result.payload["data"]["candles"]) == 1


def test_api_failure_falls_back_to_fixture(monkeypatch, tmp_path):
    """API failures should fall back to the fixture"""

    fixture = tmp_path / "candles.json"

    fixture.write_text(
        json.dumps({
            "data": {
                "symbol": "TEST.NS",
                "interval": "1d",
                "currency": "INR",
                "candles": [
                    {
                        "date": "2026-07-01",
                        "open": 100,
                        "high": 110,
                        "low": 95,
                        "close": 105,
                        "adjclose": 105,
                        "volume": 1000,
                        "synthetic": False,
                    }
                ],
            },
            "meta": {
                "asOf": "2026-07-31",
                "disclaimer": "Test",
                "symbol": "TEST.NS",
                "source": "fixture",
            },
        }),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "analytics.src.extract.api_is_configured",
        lambda: True,
    )

    def fake_fetch(symbol, from_date, to_date, interval):
        raise ExtractionError("API unavailable")

    monkeypatch.setattr(
        "analytics.src.extract.fetch_from_api",
        fake_fetch,
    )

    result = extract(
        symbol="TEST.NS",
        from_date=DEFAULT_FROM_DATE,
        to_date=DEFAULT_TO_DATE,
        interval=DEFAULT_INTERVAL,
        fixture_path=fixture,
    )

    assert result.source == "fixture"
    assert len(result.payload["data"]["candles"]) == 1


def test_fixture_metadata_is_preserved():
    """Fixture envelope metadata should remain in the raw payload"""

    result = extract(
        symbol="RELIANCE.NS",
        from_date=DEFAULT_FROM_DATE,
        to_date=DEFAULT_TO_DATE,
        interval=DEFAULT_INTERVAL,
        fixture_path=(
            MOCK_DATA_DIR
            / "candles-reliance-ns-2026-07.json"
        ),
    )

    payload = result.payload

    assert payload["data"]["interval"] is not None
    assert payload["data"]["currency"] is not None

    assert payload["meta"]["asOf"] is not None
    assert payload["meta"]["disclaimer"] is not None
    assert payload["meta"]["symbol"] == "RELIANCE.NS"
    assert payload["meta"]["source"] is not None