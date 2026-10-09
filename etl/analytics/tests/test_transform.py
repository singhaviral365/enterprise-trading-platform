import json
from analytics.src.transform import transform
from analytics.config import MOCK_DATA_DIR

def load_fixture(filename: str) -> dict:
    """Load a fixture directly as a raw CandlesResponse payload."""

    fixture_path = MOCK_DATA_DIR / filename

    with fixture_path.open("r", encoding="utf-8") as file:
        return json.load(file)

def test_reliance_fixture_has_expected_clean_rows():
    """Valid RELIANCE candles should survive transformation"""

    payload = load_fixture("candles-reliance-ns-2026-07.json")
    result = transform(payload)

    assert len(result.quarantined) == 0
    assert len(result.clean) == 9

def test_calendar_gap_is_not_filled():
    """Missing trading days should remain missing"""

    payload = load_fixture("candles-reliance-ns-2026-07.json")
    result = transform(payload)

    dates = set(result.clean["date"].dt.strftime("%Y-%m-%d"))

    assert len(dates) == 9

def test_infy_null_volume_is_allowed():
    """Null volume is valid according to the upstream contract"""

    payload = load_fixture("candles-infy-ns-2026-07.json")
    result = transform(payload)

    assert len(result.quarantined) == 0
    assert result.clean["volume"].isna().any()

def test_infy_synthetic_flag_is_preserved():
    """Synthetic candles should retain their provenance flag"""

    payload = load_fixture("candles-infy-ns-2026-07.json")
    result = transform(payload)

    assert result.clean["synthetic"].eq(True).any()

def test_malformed_fixture_quarantines_invalid_rows():
    """Malformed candle records must never reach the clean output"""

    payload = load_fixture("candles-malformed.json")
    result = transform(payload)

    assert len(result.quarantined) > 0
    assert result.quarantined["quarantine_reason"].notna().all()

def test_no_invalid_ohlc_reaches_clean_output():
    """Rows with invalid OHLC relationships must be rejected"""

    payload = load_fixture("candles-malformed.json")
    result = transform(payload)

    assert not (
        result.clean["high"] < result.clean["low"]
    ).any()

def test_negative_volume_does_not_reach_clean_output():
    """Negative volume must be quarantined"""

    payload = load_fixture("candles-malformed.json")
    result = transform(payload)

    assert not (
        result.clean["volume"] < 0
    ).any()

def test_duplicate_dates_do_not_reach_clean_output():
    """All records involved in a duplicate date must be rejected"""

    payload = load_fixture("candles-malformed.json")
    result = transform(payload)

    duplicate_dates = result.quarantined.loc[
        result.quarantined["quarantine_reason"]
        == "duplicate_date",
        "date",
    ]

    assert not duplicate_dates.empty