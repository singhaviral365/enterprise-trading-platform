import pandas as pd
from analytics.src.load import load, load_quarantine

def test_load_creates_csv(tmp_path):
    """Clean candle data should be written as csv"""

    df = pd.DataFrame({
        "date": pd.to_datetime(["2026-07-01"]),
        "open": [100.0],
        "high": [110.0],
        "low": [95.0],
        "close": [105.0],
        "adjclose": [105.0],
        "volume": [1000.0],
        "synthetic": [False],
    })

    path = load(dataframe=df, symbol="TEST.NS", output_dir=tmp_path)

    assert path.exists()
    assert path.suffix == ".csv"

    loaded = pd.read_csv(path)

    assert len(loaded) == 1
    assert loaded.iloc[0]["close"] == 105.0

def test_empty_quarantine_creates_no_file(tmp_path):
    """No quarantine file should be created when nothing is malformed"""

    df = pd.DataFrame()
    path = load_quarantine(dataframe=df, symbol="TEST.NS", output_dir=tmp_path,)

    assert path is None
    assert not list(tmp_path.iterdir())