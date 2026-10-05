from dataclasses import dataclass
from pathlib import Path
import argparse
from analytics.src.extract import ExtractResult, extract
from analytics.src.load import load, load_quarantine
from analytics.src.transform import TransformResult, transform
from analytics.config import DEFAULT_FIXTURE, DEFAULT_FROM_DATE, DEFAULT_TO_DATE, DEFAULT_INTERVAL, DEFAULT_SYMBOL

@dataclass
class PipelineResult:
    """Summary and provenance information for a completed ETL run"""

    symbol: str
    source: str
    interval: str | None
    currency: str | None
    as_of: str | None
    disclaimer: str | None
    metadata_symbol: str | None
    metadata_source: str | None
    extracted_rows: int
    loaded_rows: int
    quarantined_rows: int
    output_path: Path
    quarantine_path: Path | None


def run_pipeline(symbol: str, from_date: str, to_date: str, fixture_path: Path, interval: str = "1d") -> PipelineResult:
    """Run extraction, transformation and loading for one symbol"""

    extracted: ExtractResult = extract(symbol=symbol, from_date=from_date, to_date=to_date, fixture_path=fixture_path, interval=interval)
    transformed: TransformResult = transform(extracted.payload)
    output_path = load(dataframe=transformed.clean, symbol=transformed.symbol)
    quarantine_path = load_quarantine(dataframe=transformed.quarantined, symbol=transformed.symbol)

    return PipelineResult(
        symbol=transformed.symbol,
        source=extracted.source,
        interval=transformed.interval,
        currency=transformed.currency,
        as_of=transformed.as_of,
        disclaimer=transformed.disclaimer,
        metadata_symbol=transformed.metadata_symbol,
        metadata_source=transformed.metadata_source,
        extracted_rows=len(transformed.clean) + len(transformed.quarantined),
        loaded_rows=len(transformed.clean),
        quarantined_rows=len(transformed.quarantined),
        output_path=output_path,
        quarantine_path=quarantine_path,
    )

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Run the Fauxnance candle ETL pipeline.")
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL, help=f"Instrument symbol. Default: {DEFAULT_SYMBOL}")
    parser.add_argument("--from-date", default=DEFAULT_FROM_DATE, help=f"Inclusive API start date. Default: {DEFAULT_FROM_DATE}")
    parser.add_argument("--to-date", default=DEFAULT_TO_DATE, help=f"Inclusive API end date. Default: {DEFAULT_TO_DATE}")
    parser.add_argument("--interval", default=DEFAULT_INTERVAL, choices=["1d"], help=f"Candle interval. Default: {DEFAULT_INTERVAL}")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE, help=f"Fallback fixture. Default: {DEFAULT_FIXTURE}")

    args = parser.parse_args()

    result = run_pipeline(
        symbol=args.symbol,
        from_date=args.from_date,
        to_date=args.to_date,
        fixture_path=args.fixture,
        interval=args.interval,
    )

    print(f"Symbol: {result.symbol}")
    print(f"Source: {result.source}")
    print(f"Interval: {result.interval}")
    print(f"Currency: {result.currency}")
    print(f"Extracted: {result.extracted_rows}")
    print(f"Loaded: {result.loaded_rows}")
    print(f"Quarantined: {result.quarantined_rows}")
    print(f"Output: {result.output_path}")

    if result.quarantine_path:
        print(f"Quarantine: {result.quarantine_path}")