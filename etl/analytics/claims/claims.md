# Claims

Three claims, minimum. One row each. Replace every CHANGE_ME.

A claim is a sentence about the business that could turn out to be wrong. It
names what is true, of what, over what period, and with what magnitude. It is
not a description of a chart, and it is not a question. If a reader can
disagree with it, it is a claim. See the sprint README for the worked example.

The chart artefact is the path to the file holding the chart that supports the
claim, relative to this folder. Where one file holds several charts, point at
the chart inside it with a fragment, and the file has to be committed either
way.

| # | Claim | Chart artefact |
|---|---|---|
| 1 | Reliance Industries (RELIANCE.NS) shares fell 17.0%, from a close of ₹1,575.60 on 1 January 2026 to ₹1,307.80 on 31 July 2026, and the chart shows this as a sustained downward drift rather than a single crash day. | ![Claim 1](charts\images_RELIANCE-NS\RELIANCE-NS-cumulative-return.png) |
| 2 | Infosys' (INFY.NS) 10 busiest trading days between January and July 2026 made up only 6.8% of all trading days but accounted for 20.1% of total recorded trading volume. | ![Claim 2](charts\images_INFY-NS\INFY-NS-volume-concentration.png) |
| 3 | Apple (AAPL) closed above its opening price on 86 of 151 trading days (57%) between January and July 2026, more often than it closed below (65 days, 43%), consistent with its 14.0% net gain over the period. |![Claim 3](charts\images_AAPL\AAPL-positive-negative-days.png) |

Filled in, a row looks like this. The claim is invented and out of domain
deliberately, so that copying it gets you nothing. It is numbered `x` rather
than with a digit so that nobody mistakes it for one of yours:

| x | Complaints about the mid-range laptop range doubled in the month after the March firmware update and have not fallen back since. | report.html#laptop-complaints |

Add rows past the third if you have more, numbered in sequence. Every artefact
named in this table has to exist in the repository. Whether the claim is true,
whether the chart supports it, and whether a non-technical reader can read the
chart unaided are assessed by your instructor.

## Notes

**Symbols in scope:** `RELIANCE.NS` and `INFY.NS` (both NSE, satisfying the
two-NSE/BSE-instrument requirement) alongside `AAPL` (Nasdaq), chosen so the
Indian names could be checked against each other and against a US name moving
on a different exchange and in a different currency over the same window.

**Date range pulled:** `2026-01-01` to `2026-07-31`, daily candles (`1d`
interval), pulled through `GET /candles/{symbol}` via
[etl_pipeline.py](../src/etl_pipeline.py). That is 152 raw trading days for
`RELIANCE.NS` and `INFY.NS` and 151 for `AAPL` (US and Indian trading calendars
differ), all loaded as `source: api`, none from the fixture fallback.

**What the transform rejected:** [transform.py](../src/transform.py) quarantines
rows with a missing required field, a non-numeric price or volume, a close/open/
high/low relationship that is not physically possible (high below open, close
or low, or low above open or close), a negative volume, and a duplicate trading
date; see the malformed-input assertions in
[tests/test_transform.py](../tests/test_transform.py). None of the three live
pulls used for these claims produced quarantined rows; every row in
`output/candles/*.csv` cleared these checks. `Extracted` equals `Loaded` for all
three symbols per the pipeline's own printed summary.

**A claim considered and withdrawn:** both `RELIANCE.NS` and `INFY.NS` show a
"smallest intraday range" of exactly 0.0% on 2026-01-15 (open, high, low and
close identical). That is a plausible fixed/no-trade session rather than a
finding about genuine price stability, so no claim was built on it — a claim
about volatility should hold up against days the market was actually open and
moving, and this row does not tell us that.

**How a teammate runs this:** there is no console script; the entry point is a
`__main__` block.

```bash
# from the repository root, with .env populated from .env.example
python -m analytics.src.etl_pipeline --symbol RELIANCE.NS --from-date 2026-01-01 --to-date 2026-07-31 --interval 1d
python -m analytics.src.etl_pipeline --symbol INFY.NS --from-date 2026-01-01 --to-date 2026-07-31 --interval 1d
python -m analytics.src.etl_pipeline --symbol AAPL --from-date 2026-01-01 --to-date 2026-07-31 --interval 1d

# then, once analytics/output/candles/*.csv exists for each symbol above:
python analytics/claims/generate_charts.py
```

`generate_charts.py` reads every symbol's transformed CSV from
`analytics/output/candles/`, computes candidate findings and charts per symbol,
and writes one self-contained dashboard to `charts/report.html`
(no network access or build step needed to open it), plus one combined
`charts/candidate_findings.csv` and one `charts/images_<SYMBOL>/` folder of PNG
chart exports per symbol.
