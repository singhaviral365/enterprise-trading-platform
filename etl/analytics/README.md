# 1. Analytics and Ingestion ETL Pipeline

- Extracts daily candle data for financial instruments.
- Uses the Fauxnance API when:
  - The API base URL is configured.
  - The API key is configured.
  - No matching cached response is available.
  - The Fauxnance health check succeeds.
  - The API usage check succeeds.
  - The API request succeeds.
- Falls back to local JSON fixtures when:
  - The API key is missing.
  - Authentication fails.
  - The API is unavailable.
  - The API request times out or encounters a network failure.
  - The API returns a server-side error.
  - API fallback is enabled.
- Checks the raw-response cache before making API requests.
- Caches successful raw API responses by symbol, date range and interval.
- Returns raw `CandlesResponse` payloads from the extraction stage.
- Converts raw candle records into a pandas DataFrame during transformation.
- Preserves response-level metadata for future referee.
- Validates and cleans candle data.
- Separates malformed records into a quarantine dataset.
- Saves clean candle data as CSV.
- Saves quarantined records as a separate CSV.
- Runs entirely from local fixtures during tests.
- Requires no network access, API key, or API quota for the test suite.

# 2. ETL

### Extract

- The pipeline starts with a requested instrument symbol.
- `extract.py` decides where the raw data should come from.
- The preferred source is the Fauxnance API.
- The fallback source is a local JSON fixture.
- A previously cached raw API response is preferred over a new API request.
- Both API responses and fixtures use the same `CandlesResponse` envelope.
- The extractor does not apply data-quality rules.
- The extractor does not clean or modify candle records.
- The extractor returns the raw response payload unchanged.
- This keeps the rest of the pipeline source-agnostic.

#### Extraction Flow

- Check whether a matching cached response exists.
- If a cached response exists:
  - Load the raw JSON response.
  - Return the cached payload.
  - Do not make another candle API request.
- If no cached response exists:
  - Check API configuration.
  - Check Fauxnance health using `GET /health`.
  - Check API-key usage using `GET /usage`.
  - Build the `GET /candles/{symbol}` endpoint.
  - Send the API key using the `X-Api-Key` header.
  - Include `from`, `to` and `interval` query parameters.
  - Receive the raw JSON response.
  - Cache the successful raw response.
  - Return the raw payload.
- If the API cannot be used:
  - Load the appropriate fixture.
  - Return the raw fixture payload.
- No candle-level cleaning occurs during extraction.

#### Fauxnance Request

- Endpoint:
  - `GET /candles/{symbol}`
- Authentication:
  - `X-Api-Key` header.
- API key source:
  - `FAUXNANCE_API_KEY` environment variable.
- Query parameters:
  - `from`
  - `to`
  - `interval`
- Supported interval:
  - `1d`

#### API Health and Usage Checks

- `GET /health` is called without an API key.
- Health is checked before assuming the API is unavailable.
- `GET /usage` is called with the configured API key.
- Usage is checked before requesting candle data.
- A `429` response indicates the daily quota is exhausted.
- The `Retry-After` header is read from rate-limit responses.
- The pipeline does not sleep until the quota resets.

#### API Failure Handling

- `429`:
  - Raises a rate-limit error.
  - Reads `Retry-After`.
  - Stops the current extraction.
  - Does not retry until the quota resets.
- Other `4xx` responses:
  - Are treated as request or symbol failures.
  - Are not retried.
  - Are logged.
  - Can trigger fixture fallback when enabled.
- Connection errors:
  - Are retried.
  - Use exponential backoff.
  - Stop after the configured retry limit.
- Timeouts:
  - Are retried.
  - Use exponential backoff.
  - Stop after the configured retry limit.
- `5xx` responses:
  - Are retried.
  - Use exponential backoff.
  - Fall back when retries are exhausted and fallback is enabled.
- HTTP `200` responses:
  - Are returned to transformation.
  - Are not assumed to be valid simply because the HTTP request succeeded.

# 3. Response Metadata and Provenance

### Metadata Preserved

- `data.symbol`
- `data.interval`
- `data.currency`
- `meta.asOf`
- `meta.disclaimer`
- `meta.symbol`
- `meta.source`

### Why Metadata Is Preserved

- Identifies where the data originated.
- Records the requested instrument.
- Records the candle interval.
- Records the currency.
- Preserves the upstream `asOf` value.
- Preserves the upstream disclaimer.
- Allows API, cache and fixture provenance to be distinguished.
- Keeps metadata available to downstream processing.
- Prevents response metadata from polluting the candle-level analytical CSV.

# 4. Transform

- `transform.py` owns data parsing and data quality.
- The transformation stage receives the raw `CandlesResponse` payload.
- The transformation stage does not care whether the payload came from the API, cache or fixture.
- The transformation stage applies the same rules to every source.
- Transform opens no network connection.
- Transform reads no environment variables.
- Transform writes no files.

### Transformation Flow

- Validate the `CandlesResponse` envelope.
- Extract `data.candles`.
- Extract response-level metadata.
- Convert candle records into a pandas DataFrame.
- Validate required columns.
- Convert dates to the expected format.
- Convert numeric fields to numeric pandas types.
- Normalize the `synthetic` field.
- Validate required price values.
- Validate OHLC relationships.
- Validate volume.
- Detect duplicate trading dates.
- Separate valid records from malformed records.
- Sort valid candles chronologically.
- Return:
  - `clean`
  - `quarantined`
  - response-level metadata.

# 5. Data Quality Rules

### Required Columns

- `date`
- `open`
- `high`
- `low`
- `close`
- `adjclose`
- `volume`
- `synthetic`

## Numeric Fields

- `open`
- `high`
- `low`
- `close`
- `adjclose`
- `volume`

### Date Rules

- Dates must follow the expected ISO format:
  - `YYYY-MM-DD`
- Invalid dates are quarantined.
- Dates are parsed and validated using pandas datetime handling.
- Valid dates are normalized to the expected `YYYY-MM-DD` representation for output.
- Calendar gaps are not automatically filled.
- Missing trading days are preserved as missing observations.

### Volume Rules

- Positive volume is valid.
- Zero volume is accepted unless an upstream contract says otherwise.
- Null volume is accepted because the live API can emit null volume.
- Negative volume is quarantined.

### Synthetic Rules

- The `synthetic` flag is preserved.
- `True` and `False` values remain available to downstream analytics.
- Synthetic records are not automatically discarded.

# 6. OHLC Validation

- Candle prices must obey normal OHLC relationships.
- `high` must be greater than or equal to:
  - `open`
  - `close`
  - `low`
- `low` must be less than or equal to:
  - `open`
  - `close`
  - `high`
- A candle with `high < low` is invalid.
- A candle with `high < open` is invalid.
- A candle with `high < close` is invalid.
- A candle with `low > open` is invalid.
- A candle with `low > close` is invalid.
- Invalid OHLC records are quarantined.
- Invalid OHLC records are never loaded into the clean analytical dataset.

# 7. Duplicate Handling

- A daily candle is identified by its trading date within the extracted symbol dataset.
- Duplicate dates are considered ambiguous.
- Identical rows are not blindly deduplicated.
- When multiple candles exist for the same date:
  - The records are quarantined.
  - No arbitrary record is selected.
- This prevents the pipeline from silently choosing an incorrect market observation.

# 8. Quarantine

- Malformed records are not silently discarded.
- Invalid records are retained in a quarantine dataset.
- Quarantined rows retain their original candle fields where possible.
- Each quarantined record receives a `quarantine_reason`.
- Examples:
  - `invalid_date`
  - `missing_or_invalid_price`
  - `invalid_ohlc_relationship`
  - `negative_volume`
  - `duplicate_date`
- The quarantine dataset provides an audit trail for upstream data problems.
- Clean analytical data therefore contains only records that passed validation.
- Invalid financial observations never reach the clean analytical output.

# 9. Load

- `load.py` owns persistence.
- Clean records are written to CSV.
- Quarantined records are written to a separate CSV.
- Output directories are created automatically when required.
- `load.py` does not perform extraction.
- `load.py` does not perform data-quality validation.
- `load.py` does not perform additional transformation.

## Clean Output

- Location:
  - `analytics/output/candles/`
- Example:
  - `RELIANCE.NS.csv`
  - `INFY.NS.csv`

## Quarantine Output

- Location:
  - `analytics/output/quarantine/`
- Example:
  - `BSE.TEST_quarantine.csv`

## Clean CSV Columns

- `date`
- `open`
- `high`
- `low`
- `close`
- `adjclose`
- `volume`
- `synthetic`

# 10. Pipeline Orchestration

- `etl_pipeline.py` is the orchestrator.
- It does not contain extraction logic.
- It does not contain transformation rules.
- It does not contain CSV-writing logic.
- It does not decide whether the API, cache or fixture is used.
- That decision belongs to `extract.py`.
- It calls the ETL stages in order.

## Pipeline

1. `extract()`
2. `transform()`
3. `load()`
4. `load_quarantine()`

## Pipeline Result

- The pipeline returns:
  - Symbol
  - Source
  - Interval
  - Currency
  - `asOf`
  - Disclaimer
  - Metadata symbol
  - Metadata source
  - Extracted row count
  - Loaded row count
  - Quarantined row count
  - Clean output path
  - Quarantine output path

# 11. Configuration

## `.env`

- Contains environment-specific and sensitive values.
- Example values:
  - `FAUXNANCE_BASE_URL`
  - `FAUXNANCE_API_KEY`
- `.env` must not be committed to source control.
- The API key is read from the environment only.
- The API key is never hard-coded in source code.
- The API key is never included in fixtures.
- The API key is never included in tests.
- The API key is never included in notebooks.
- The API key is never written to logs.

## `config.py`

- Contains non-secret application configuration.
- Defines:
  - Project paths
  - Mock-data directory
  - Cache directory
  - Output directories
  - Candle API endpoint
  - API timeout
  - API retry count
  - Retry backoff
  - Required columns
  - Numeric columns
  - Boolean columns
  - Final column order
  - API fallback behaviour
  - Default symbol
  - Default date range
  - Default interval

# 12. Raw Response Cache

- Successful API responses are cached before transformation.
- The cache stores the original `CandlesResponse` JSON.
- The cleaned DataFrame is never used as the cache representation.
- Cache entries are keyed by:
  - Symbol
  - Start date
  - End date
  - Interval
- Cached responses are checked before making API requests.
- Re-running the same extraction does not consume another candle request.
- Cache files are local runtime artifacts.
- Cache files should not be committed to source control.
- Changing transformation rules does not require another API request when a matching raw response is cached.

# 13. Project Structure

- `analytics/`
  - `config.py`
    - Central pipeline configuration.
  - `cache/`
    - Cached raw API responses.
  - `mock_data/`
    - Local API fixtures.
  - `output/`
    - Generated ETL output.
  - `etl_pipeline/`
    - ETL implementation.
  - `tests/`
    - Automated test suite.

## ETL Modules

- `extract.py`
  - API extraction.
  - Fixture fallback.
  - Raw-response caching.
  - Health checks.
  - Usage checks.
  - API authentication.
  - Retry and error handling.
  - Extraction provenance.

- `transform.py`
  - `CandlesResponse` parsing.
  - Metadata extraction.
  - DataFrame creation.
  - Data validation.
  - Data cleaning.
  - Type conversion.
  - Duplicate detection.
  - OHLC validation.
  - Quarantine handling.

- `load.py`
  - CSV persistence.
  - Clean-data output.
  - Quarantine output.

- `etl_pipeline.py`
  - ETL orchestration.
  - Pipeline result reporting.

# 14. Fixtures

## `candles-reliance-ns-2026-07.json`
- Contains nine NSE trading days.
- Represents July 2026.
- Uses the published `CandlesResponse` structure.
- Prices are invented.
- Contains a calendar gap.
- The gap represents an exchange-closed day.
- The pipeline must not fill the missing day.

## `candles-infy-ns-2026-07.json`
- Contains eight NSE trading days.
- Uses the same response structure.
- Prices are invented.
- Contains one candle with null volume.
- Contains one candle flagged as synthetic.
- Both conditions are supported by the transformation rules.

## `candles-malformed.json`
- Contains deliberately corrupted candle data.
- Uses a BSE symbol.
- Contains six malformed-data scenarios.
- Uses the same `CandlesResponse` envelope.
- Prices are invented.
- Used to verify the pipeline's defensive data-quality behaviour.

# 15. Malformed Fixture Tests

## Duplicate Date
- `2026-07-01` occurs twice.
- The records contain different closing prices.
- Both records are quarantined.
- The pipeline must not arbitrarily choose one.

## Missing Close
- The `2026-07-02` candle has no `close`.
- The record is quarantined.
- The record must not reach the clean CSV.

## Invalid Numeric Value
- The `2026-07-06` candle contains `"n/a"` where a numeric value is expected.
- The invalid value is converted to an invalid numeric representation.
- The record is quarantined.
- The record must not reach the clean CSV.

## Invalid OHLC Relationship
- The `2026-07-07` candle has `high < low`.
- The record is quarantined.
- The record must never reach the clean dataset.

## Negative Volume
- The `2026-07-08` candle contains negative volume.
- The record is quarantined.
- Negative volume must never reach the clean dataset.

## Invalid Date Format
- The final candle uses `09/07/2026`.
- The expected format is ISO `YYYY-MM-DD`.
- The record is quarantined.
- Locale-dependent date interpretation is avoided.

# 16. Testing Strategy
- Tests are designed to be:
  - Deterministic.
  - Fast.
  - Network-independent.
  - API-key-independent.
  - Independent of the Fauxnance daily quota.
- No test should depend on API response latency.
- Live API calls are not made by the test suite.
- API behaviour is mocked where required.
- Raw API responses are simulated with mocked HTTP responses.
- Local fixtures provide deterministic upstream payloads.
- Temporary directories are used for cache and output tests where appropriate.

# 17. Extraction Tests

## Fixture Extraction
- Verify a JSON fixture can be loaded.
- Verify the raw `CandlesResponse` payload is returned.
- Verify the payload is not cleaned during extraction.
- Verify the expected symbol is preserved.
- Verify the extraction source is reported as `fixture`.
- Verify the requested date range and interval are preserved.

## API Request
- Verify the candle endpoint is `GET /candles/{symbol}`.
- Verify the API key is sent using the `X-Api-Key` header.
- Verify the API key is read from `FAUXNANCE_API_KEY`.
- Verify the candle request contains:
  - `from`
  - `to`
  - `interval`
- Verify `GET /health` is called before API extraction.
- Verify `GET /usage` is checked before requesting candles.
- Verify the raw API response is returned unchanged.
- Verify the API key is never included in logs.

## API Fallback
- Simulate an unavailable API.
- Verify extraction falls back to the fixture.
- Verify the returned source is `fixture`.
- Verify fixture rows are still returned correctly.

## Cache
- Verify a successful API response is cached as raw JSON.
- Verify a subsequent identical request uses the cache.
- Verify a cached request does not make another candle API request.
- Verify cache keys distinguish:
  - Symbol.
  - Start date.
  - End date.
  - Interval.
- Verify a malformed cache file is ignored.
- Verify a cache miss can proceed to API extraction.

## Metadata
- Verify `interval` is preserved.
- Verify `currency` is preserved.
- Verify `asOf` is preserved.
- Verify the disclaimer is preserved.
- Verify `meta.symbol` is preserved.
- Verify `meta.source` is preserved.

## API Failure Modes
- Verify `429` raises a rate-limit error.
- Verify `Retry-After` is read from a `429` response.
- Verify `429` is not retried.
- Verify another `4xx` produces a symbol/request failure.
- Verify another `4xx` is not retried.
- Verify connection errors are retried.
- Verify timeouts are retried.
- Verify retries use increasing backoff.
- Verify repeated `5xx` responses eventually fail.
- Verify API failures can trigger fixture fallback when enabled.
- Verify malformed `200` responses are passed to transformation.

# 18. Transformation Tests

## Valid RELIANCE Data
- Verify the raw `CandlesResponse` is parsed successfully.
- Verify all valid rows survive transformation.
- Verify response metadata is preserved.
- Verify no rows are quarantined.
- Verify the expected number of rows remains.
- Verify dates are correctly typed.
- Verify the calendar gap remains a gap.
- Verify missing trading days are not filled.

## Valid INFY Data
- Verify the raw `CandlesResponse` is parsed successfully.
- Verify valid rows survive transformation.
- Verify null volume is accepted.
- Verify the synthetic flag is preserved.
- Verify response metadata is preserved.

## Malformed Data
- Verify malformed records are quarantined.
- Verify quarantine reasons are populated.
- Verify invalid OHLC records cannot reach the clean output.
- Verify negative volume cannot reach the clean output.
- Verify duplicate dates cannot reach the clean output.
- Verify invalid dates cannot reach the clean output.
- Verify invalid price values cannot reach the clean output.
- Verify the missing `close` field is detected.
- Verify the malformed date is not interpreted using locale-dependent parsing.
- Verify the clean DataFrame contains only validated records.

# 19. Load Tests

## Clean Data
- Verify clean data is written successfully.
- Verify the output uses `.csv`.
- Verify the CSV can be read back.
- Verify the expected number of rows is preserved.
- Verify the expected columns are preserved.
- Verify output directories are created when necessary.

## Quarantine Data
- Verify malformed records are written separately.
- Verify the quarantine file uses `.csv`.
- Verify quarantine reasons are preserved.
- Verify an empty quarantine DataFrame does not create an unnecessary file.

# 20. End-to-End Test
- Run the complete pipeline using a local fixture.
- Verify extraction returns the raw fixture payload.
- Verify transformation produces clean and quarantined datasets.
- Verify loading writes the clean CSV.
- Verify loading writes the quarantine CSV when required.
- Verify the source is reported as `fixture`.
- Verify extracted row count.
- Verify loaded row count.
- Verify quarantined row count.
- Verify the output CSV exists.
- Verify the quarantine CSV exists when malformed data is present.
- Verify the clean CSV can be read back successfully.
- Verify invalid records do not appear in the clean CSV.

# 21. Running the Tests
- Install dependencies:

```bash
pip install -r requirements.txt
```

- Run the complete test suite:

```bash
pytest -q
```

- Run extraction tests:

```bash
pytest analytics/tests/test_extract.py -q
```

- Run transformation tests:

```bash
pytest analytics/tests/test_transform.py -q
```

- Run loading tests:

```bash
pytest analytics/tests/test_load.py -q
```

- Run the end-to-end pipeline test:

```bash
pytest analytics/tests/test_etl_pipeline.py -q
```

````markdown
# 22. Running the ETL Pipeline

## Default Run

```bash
python -m analytics.src.etl_pipeline
````

* Runs the complete ETL pipeline using configured defaults.
* Uses the default symbol from `config.py`.
* Uses the default API request start date from `config.py`.
* Uses the default API request end date from `config.py`.
* Uses the default candle interval from `config.py`.
* Uses the default fallback fixture from `config.py`.
* Checks the raw-response cache before making an API request.
* Uses the Fauxnance API when it is configured and available.
* Checks API health and quota before requesting candles.
* Falls back to the configured fixture when API fallback is allowed.
* Applies the same transformation rules to API and fixture data.
* Writes clean records to CSV.
* Writes quarantined records to a separate CSV when required.

## RELIANCE

```bash
python -m analytics.src.etl_pipeline --symbol RELIANCE.NS --fixture analytics/mock_data/candles-reliance-ns-2026-07.json
```

* Overrides the configured default symbol.
* Uses the RELIANCE fixture if API extraction falls back to local data.
* Uses the configured default API request date range unless overridden.
* Uses the configured default interval unless overridden.

## INFY

```bash
python -m analytics.src.etl_pipeline --symbol INFY.NS --fixture analytics/mock_data/candles-infy-ns-2026-07.json
```

* Overrides the configured default symbol.
* Uses the INFY fixture if API extraction falls back to local data.
* Preserves the null volume present in the fixture.
* Preserves the synthetic candle flag.
* Uses the configured default API request date range unless overridden.

## Malformed Fixture

```bash
python -m analytics.src.etl_pipeline \
    --symbol BSE.TEST \
    --fixture analytics/mock_data/candles-malformed.json
```

* Overrides the configured default symbol.
* Uses the malformed fixture as the fallback source.
* Exercises the transformation and quarantine rules.
* Invalid candles are separated from the clean dataset.
* Invalid candles are not written to the clean analytical CSV.

## Custom API Request Range

```bash
python -m analytics.src.etl_pipeline \
    --symbol RELIANCE.NS \
    --from-date 2026-07-01 \
    --to-date 2026-07-31 \
    --interval 1d
```

* Overrides the configured API request date range.
* The dates are used for the API request and raw-response cache key.
* The returned candle dates are taken from the actual `CandlesResponse`.
* The pipeline does not manufacture missing trading days.
* The response metadata remains sourced from the API payload.

## Custom Fixture

```bash
python -m analytics.src.etl_pipeline \
    --symbol INFY.NS \
    --fixture analytics/mock_data/candles-infy-ns-2026-07.json
```

* Explicitly selects the local fixture used when API extraction falls back.
* Fixture data follows the same transformation rules as API data.
* The fixture itself remains unchanged during extraction.
* Transformation performs all validation and cleaning.

## API Request Dates vs Candle Dates

* `--from-date` and `--to-date` define the requested API range.
* These values are also part of the raw-response cache key.
* They are not expected to appear as fields in the `CandlesResponse`.
* Actual observation dates come from `data.candles[*].date`.
* The API may return fewer trading days than the requested calendar range.
* Exchange holidays and other calendar gaps are preserved.
* The pipeline does not fill missing trading days artificially.

# 23. API vs Fixture Behaviour

## API Available

- `.env` contains the API URL.
- `.env` contains the API key.
- No matching cached response exists.
- `GET /health` succeeds.
- `GET /usage` succeeds.
- The candle request succeeds.
- The raw API response is cached.
- The API response is used.
- `source` is reported as `api`.

## Cached Response Available

- A matching raw response exists for the requested symbol and range.
- The cached raw response is used.
- No candle API request is made.
- No additional candle quota is consumed.
- The raw response is passed to transformation.
- `source` is reported as `cache`.

## API Unavailable

- No matching cached response exists.
- API key is missing.
- API authentication fails.
- Health check fails.
- Usage check fails.
- Network request fails.
- Request times out.
- Fauxnance returns a server-side error.
- API fallback is enabled.
- Fixture is used.
- `source` is reported as `fixture`.

## Important Principle

- API data, cached data and fixture data follow the same transformation rules.
- The pipeline never trusts API data simply because it came from a live service.
- Cached responses are treated as raw upstream data.
- Live and mocked data are both treated as untrusted upstream input.
- Only validated records reach the clean analytical output.
- Transformation behaviour is independent of the original data source.

# 24. Design Principles

- Extraction obtains raw data.
- Extraction is the only stage responsible for network access and API authentication.
- Extraction caches raw responses before transformation.
- Transformation determines whether data is trustworthy.
- Transformation is deterministic and source-independent.
- Transformation does not access the network.
- Transformation does not read environment variables.
- Transformation does not write files.
- Loading persists trusted data.
- Loading is responsible for CSV persistence.
- Orchestration connects the three stages.
- Configuration controls behaviour without containing business logic.
- Secrets remain outside source control.
- API keys are never hard-coded.
- Fixtures make tests deterministic.
- Raw-response caching reduces unnecessary API quota consumption.
- Metadata preserves provenance.
- Invalid observations are quarantined rather than silently discarded.
- Calendar gaps are not artificially filled.
- Invalid financial observations are never loaded into the clean dataset.
- The same transformation rules apply to live API data, cached data and fixtures.


## DuckDB Setup (One-Time)

The analytics project uses DuckDB as its local analytical database. Each developer creates the database once on their machine.

### 1. Install dependencies

From the repository root:

```powershell
pip install -r analytics/requirements.txt
```

### 2. Create the analytical database

Run:

```powershell
python -m analytics.duckdb_store
```

This creates a local database at:

```
data/analytics.duckdb
```

using the schema defined in:

```
contracts/analytics-schema.sql
```

The following tables are created:

- `dim_account`
- `dim_instrument`
- `dim_date`
- `fact_trades`

> This is a **one-time setup**. Re-run it only if you delete the database or the schema changes.