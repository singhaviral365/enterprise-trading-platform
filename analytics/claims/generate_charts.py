"""Build the combined, self-contained analytics dashboard.

Reads every transformed candle CSV in ``analytics/output/candles/``,
computes candidate findings and charts per symbol, and writes one
HTML file (``analytics/claims/charts/report.html``) that opens with
no network access and no build step. Charts for each symbol live in
their own named section, addressable with a URL fragment, for example
``report.html#RELIANCE-NS-daily-volume``.
"""

from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
from plotly.offline import plot

CANDLES_DIR = Path("analytics/output/candles")
OUTPUT_DIR = Path("analytics/claims/charts")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REPORT_FILE = OUTPUT_DIR / "report.html"
FINDINGS_FILE = OUTPUT_DIR / "candidate_findings.csv"

# Every symbol here needs a transformed CSV under CANDLES_DIR, produced by
# running analytics.src.etl_pipeline for that symbol first. Order is the
# order sections appear in the dashboard.
SYMBOLS = ["RELIANCE.NS", "INFY.NS", "AAPL"]

COMPANY_NAMES = {
    "AAPL": "Apple Inc.",
    "RELIANCE.NS": "Reliance Industries",
    "INFY.NS": "Infosys Ltd",
    "TATASTEEL.BO": "Tata Steel Ltd",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "TSLA": "Tesla Inc.",
    "META": "Meta Platforms Inc.",
}

REQUIRED_COLUMNS = {
    "date", "open", "high", "low", "close", "adjclose", "volume", "synthetic",
}

NUMERIC_COLUMNS = ["open", "high", "low", "close", "adjclose", "volume"]


def anchor_prefix(symbol: str) -> str:
    """Return an HTML-id-safe prefix for a symbol, e.g. RELIANCE.NS -> RELIANCE-NS"""
    return symbol.replace(".", "-")


def load_and_prepare(symbol: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load one symbol's transformed CSV and derive analysis columns"""

    input_file = CANDLES_DIR / f"{symbol}.csv"

    if not input_file.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_file}")

    df = pd.read_csv(input_file)

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"{symbol}: missing required columns: {sorted(missing)}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.sort_values("date").reset_index(drop=True)

    df["daily_change_pct"] = (df["close"] - df["open"]) / df["open"] * 100
    df["absolute_daily_change_pct"] = df["daily_change_pct"].abs()
    df["intraday_range_pct"] = (df["high"] - df["low"]) / df["open"] * 100

    first_close = df["close"].iloc[0]
    df["cumulative_return_pct"] = ((df["close"] / first_close) - 1) * 100

    df["month"] = df["date"].dt.to_period("M").astype(str)

    volume_df = df[df["volume"].notna() & (~df["synthetic"].fillna(False))].copy()

    return df, volume_df


def compute_findings(symbol: str, df: pd.DataFrame, volume_df: pd.DataFrame) -> list[dict]:
    """Compute candidate findings for one symbol"""

    findings = []

    best_day = df.loc[df["daily_change_pct"].idxmax()]
    findings.append({"symbol": symbol, "candidate": "Largest daily gain", "date": best_day["date"].date(), "value": best_day["daily_change_pct"], "unit": "%"})

    worst_day = df.loc[df["daily_change_pct"].idxmin()]
    findings.append({"symbol": symbol, "candidate": "Largest daily decline", "date": worst_day["date"].date(), "value": worst_day["daily_change_pct"], "unit": "%"})

    largest_range_day = df.loc[df["intraday_range_pct"].idxmax()]
    findings.append({"symbol": symbol, "candidate": "Largest intraday range", "date": largest_range_day["date"].date(), "value": largest_range_day["intraday_range_pct"], "unit": "%"})

    smallest_range_day = df.loc[df["intraday_range_pct"].idxmin()]
    findings.append({"symbol": symbol, "candidate": "Smallest intraday range", "date": smallest_range_day["date"].date(), "value": smallest_range_day["intraday_range_pct"], "unit": "%"})

    top_volume = pd.DataFrame()

    if not volume_df.empty:
        highest_volume_day = volume_df.loc[volume_df["volume"].idxmax()]
        findings.append({"symbol": symbol, "candidate": "Highest volume day", "date": highest_volume_day["date"].date(), "value": highest_volume_day["volume"], "unit": "shares"})

        top_n = min(10, len(volume_df))
        top_volume = volume_df.nlargest(top_n, "volume")

        total_volume = volume_df["volume"].sum()
        top_volume_share = top_volume["volume"].sum() / total_volume * 100
        top_days_share = top_n / len(volume_df) * 100

        findings.append({"symbol": symbol, "candidate": f"Top {top_n} days volume share", "date": "", "value": top_volume_share, "unit": "%"})
        findings.append({"symbol": symbol, "candidate": f"Top {top_n} days share of valid-volume days", "date": "", "value": top_days_share, "unit": "%"})

    if not volume_df.empty and not top_volume.empty:
        top_volume_average_move = top_volume["absolute_daily_change_pct"].mean()
        remaining = volume_df.drop(top_volume.index)

        if not remaining.empty:
            remaining_average_move = remaining["absolute_daily_change_pct"].mean()

            findings.append({"symbol": symbol, "candidate": "Top-volume average absolute movement", "date": "", "value": top_volume_average_move, "unit": "%"})
            findings.append({"symbol": symbol, "candidate": "Remaining-days average absolute movement", "date": "", "value": remaining_average_move, "unit": "%"})

            if remaining_average_move != 0:
                movement_ratio = top_volume_average_move / remaining_average_move
                movement_difference_pct = (movement_ratio - 1) * 100

                findings.append({"symbol": symbol, "candidate": "High-volume movement ratio", "date": "", "value": movement_ratio, "unit": "x"})
                findings.append({"symbol": symbol, "candidate": "High-volume movement difference", "date": "", "value": movement_difference_pct, "unit": "%"})

    if len(volume_df) >= 2:
        correlation = volume_df[["volume", "absolute_daily_change_pct"]].corr().iloc[0, 1]
        findings.append({"symbol": symbol, "candidate": "Volume / price movement correlation", "date": "", "value": correlation, "unit": "correlation"})

    positive_days = df[df["close"] > df["open"]]
    negative_days = df[df["close"] < df["open"]]
    flat_days = df[df["close"] == df["open"]]

    findings.append({"symbol": symbol, "candidate": "Number of positive days", "date": "", "value": len(positive_days), "unit": "days"})
    findings.append({"symbol": symbol, "candidate": "Number of negative days", "date": "", "value": len(negative_days), "unit": "days"})
    findings.append({"symbol": symbol, "candidate": "Number of flat days", "date": "", "value": len(flat_days), "unit": "days"})

    if not positive_days.empty:
        findings.append({"symbol": symbol, "candidate": "Average positive-day movement", "date": "", "value": positive_days["daily_change_pct"].mean(), "unit": "%"})

    if not negative_days.empty:
        findings.append({"symbol": symbol, "candidate": "Average absolute negative-day movement", "date": "", "value": negative_days["daily_change_pct"].abs().mean(), "unit": "%"})

    return findings


def build_charts(symbol: str, company_name: str, df: pd.DataFrame, volume_df: pd.DataFrame) -> list[tuple[str, str, str, go.Figure]]:
    """Build the candidate chart set for one symbol"""

    prefix = anchor_prefix(symbol)
    charts = []

    fig1 = go.Figure()
    fig1.add_trace(go.Scatter(x=df["date"], y=df["close"], mode="lines+markers", hovertemplate="Date: %{x|%d %b %Y}<br>Closing price: %{y:.2f}<extra></extra>"))
    fig1.update_layout(title=f"{company_name}: Closing price over time", xaxis_title="Trading date", yaxis_title="Closing price (local currency per share)", template="plotly_white", height=600)
    charts.append((f"{prefix}-closing-price", "Closing Price", f"This chart shows the closing share price of {company_name} for each trading day in the analysis period. It helps identify the overall direction and magnitude of price changes over time.", fig1))

    fig2 = go.Figure()
    fig2.add_trace(go.Bar(x=df["date"], y=df["daily_change_pct"], hovertemplate="Date: %{x|%d %b %Y}<br>Daily change: %{y:.2f}%<extra></extra>"))
    fig2.update_layout(title=f"{company_name}: Daily price movement", xaxis_title="Trading date", yaxis_title="Change from open to close (%)", template="plotly_white", height=600)
    charts.append((f"{prefix}-daily-price-movement", "Daily Price Movement", f"This chart shows the percentage change from the opening price to the closing price for each trading day for {company_name}. Positive values mean the share price finished the day above its opening price.", fig2))

    fig3 = go.Figure()
    fig3.add_trace(go.Bar(x=volume_df["date"], y=volume_df["volume"], hovertemplate="Date: %{x|%d %b %Y}<br>Trading volume: %{y:,.0f} shares<extra></extra>"))
    fig3.update_layout(title=f"{company_name}: Daily trading volume", xaxis_title="Trading date", yaxis_title="Trading volume (shares)", template="plotly_white", height=600)
    charts.append((f"{prefix}-daily-volume", "Daily Trading Volume", f"This chart shows the number of shares recorded as traded for {company_name} on each valid-volume trading day. It helps identify days when trading activity was unusually high or low.", fig3))

    fig4 = go.Figure()
    fig4.add_trace(go.Bar(x=df["date"], y=df["intraday_range_pct"], hovertemplate="Date: %{x|%d %b %Y}<br>Intraday range: %{y:.2f}%<extra></extra>"))
    fig4.update_layout(title=f"{company_name}: Daily intraday price range", xaxis_title="Trading date", yaxis_title="Intraday price range (%)", template="plotly_white", height=600)
    charts.append((f"{prefix}-intraday-volatility", "Daily Intraday Price Range", f"This chart measures the difference between the highest and lowest recorded price during each trading day for {company_name}, expressed as a percentage of the opening price.", fig4))

    fig5 = go.Figure()
    fig5.add_trace(go.Scatter(x=volume_df["absolute_daily_change_pct"], y=volume_df["volume"], mode="markers", text=volume_df["date"].dt.strftime("%d %b %Y"), hovertemplate="Date: %{text}<br>Absolute price movement: %{x:.2f}%<br>Trading volume: %{y:,.0f} shares<extra></extra>"))
    fig5.update_layout(title=f"{company_name}: Trading volume versus daily price movement", xaxis_title="Absolute daily price movement (%)", yaxis_title="Trading volume (shares)", template="plotly_white", height=600)
    charts.append((f"{prefix}-volume-price-movement", "Trading Volume Versus Daily Price Movement", f"This chart compares the number of shares traded for {company_name} with the absolute size of the open-to-close price movement. Each point represents one trading day.", fig5))

    ranked = volume_df.sort_values("volume", ascending=False).reset_index(drop=True)
    ranked["volume_rank"] = ranked.index + 1
    volume_total = ranked["volume"].sum()
    ranked["cumulative_volume_share"] = ranked["volume"].cumsum() / volume_total * 100 if volume_total else 0

    fig6 = go.Figure()
    fig6.add_trace(go.Bar(x=ranked["volume_rank"], y=ranked["volume"], name="Daily trading volume", hovertemplate="Volume rank: %{x}<br>Volume: %{y:,.0f} shares<extra></extra>"))
    fig6.add_trace(go.Scatter(x=ranked["volume_rank"], y=ranked["cumulative_volume_share"], name="Cumulative volume share", yaxis="y2", hovertemplate="Volume rank: %{x}<br>Cumulative volume share: %{y:.2f}%<extra></extra>"))
    fig6.update_layout(title=f"{company_name}: Concentration of trading volume", xaxis_title="Trading days ranked by volume", yaxis_title="Daily trading volume (shares)", yaxis2=dict(title="Cumulative volume share (%)", overlaying="y", side="right", range=[0, 100]), template="plotly_white", height=600)
    charts.append((f"{prefix}-volume-concentration", "Trading Volume Concentration", f"This chart ranks trading days for {company_name} from highest to lowest trading volume and shows the cumulative share of total recorded volume.", fig6))

    higher_count = len(df[df["close"] > df["open"]])
    lower_count = len(df[df["close"] < df["open"]])
    unchanged_count = len(df[df["close"] == df["open"]])
    total_days = higher_count + lower_count + unchanged_count

    direction_counts = pd.DataFrame({
        "direction": ["Closed higher", "Closed lower", "Closed unchanged"],
        "days": [higher_count, lower_count, unchanged_count],
        "percentage": [
            higher_count / total_days * 100 if total_days else 0,
            lower_count / total_days * 100 if total_days else 0,
            unchanged_count / total_days * 100 if total_days else 0,
        ],
    })

    fig7 = go.Figure()
    fig7.add_trace(go.Bar(
        x=direction_counts["direction"], y=direction_counts["days"],
        text=[f"{d} days ({p:.1f}%)" for d, p in zip(direction_counts["days"], direction_counts["percentage"])],
        textposition="auto",
        hovertemplate="%{x}<br>Trading days: %{y}<br>Percentage of days: %{customdata:.1f}%<extra></extra>",
        customdata=direction_counts["percentage"],
    ))
    fig7.update_layout(title=f"{company_name}: Closing direction, higher versus lower", xaxis_title="Daily closing direction", yaxis_title="Number of trading days", template="plotly_white", height=600)
    charts.append((f"{prefix}-positive-negative-days", "Closed Higher Versus Closed Lower", f"This chart compares the number of trading days on which {company_name} closed above its opening price with the number of days it closed below its opening price.", fig7))

    fig8 = go.Figure()
    fig8.add_trace(go.Scatter(x=volume_df["intraday_range_pct"], y=volume_df["volume"], mode="markers", text=volume_df["date"].dt.strftime("%d %b %Y"), hovertemplate="Date: %{text}<br>Intraday range: %{x:.2f}%<br>Trading volume: %{y:,.0f} shares<extra></extra>"))
    fig8.update_layout(title=f"{company_name}: Trading volume versus intraday volatility", xaxis_title="Intraday price range (%)", yaxis_title="Trading volume (shares)", template="plotly_white", height=600)
    charts.append((f"{prefix}-volume-volatility", "Trading Volume Versus Intraday Volatility", f"This chart compares trading volume with the size of the intraday price range for {company_name}. Each point represents one trading day.", fig8))

    number_of_extremes = min(5, len(df))
    extreme_days = pd.concat([df.nlargest(number_of_extremes, "daily_change_pct"), df.nsmallest(number_of_extremes, "daily_change_pct")])
    extreme_days = extreme_days.drop_duplicates(subset=["date"]).sort_values("daily_change_pct")

    fig9 = go.Figure()
    fig9.add_trace(go.Bar(x=extreme_days["date"], y=extreme_days["daily_change_pct"], hovertemplate="Date: %{x|%d %b %Y}<br>Daily change: %{y:.2f}%<extra></extra>"))
    fig9.update_layout(title=f"{company_name}: Largest daily price movements", xaxis_title="Trading date", yaxis_title="Daily price change (%)", template="plotly_white", height=600)
    charts.append((f"{prefix}-extreme-movements", "Largest Daily Price Movements", f"This chart displays the trading days with the largest upward and downward movements for {company_name}, measured from opening price to closing price.", fig9))

    fig10 = go.Figure()
    fig10.add_trace(go.Scatter(x=df["date"], y=df["cumulative_return_pct"], mode="lines+markers", hovertemplate="Date: %{x|%d %b %Y}<br>Cumulative price change: %{y:.2f}%<extra></extra>"))
    fig10.update_layout(title=f"{company_name}: Cumulative price change from the start of the period", xaxis_title="Trading date", yaxis_title="Cumulative price change (%)", template="plotly_white", height=600)
    charts.append((f"{prefix}-cumulative-return", "Cumulative Price Change From the Start of the Period", f"This chart shows how the closing price of {company_name} changed relative to the first recorded closing price in the dataset.", fig10))

    return charts


def render_symbol_section(symbol: str, company_name: str, df: pd.DataFrame, volume_df: pd.DataFrame, charts: list, is_first_symbol: bool) -> str:
    """Render one symbol's summary and chart sections as HTML"""

    html_sections = []

    for index, (anchor, title, description, figure) in enumerate(charts):
        chart_html = plot(
            figure,
            include_plotlyjs=(is_first_symbol and index == 0),
            output_type="div",
        )
        html_sections.append(
            f"""
            <section id="{anchor}">
                <h3>{title}</h3>
                <p class="chart-description">{description}</p>
                {chart_html}
            </section>
            """
        )

    return f"""
    <div class="company">
        <h2>{company_name} ({symbol})</h2>
        <div class="summary">
            <p>Analysis period: <strong>{df["date"].min().date()}</strong> to <strong>{df["date"].max().date()}</strong>.</p>
            <p>Total observations: <strong>{len(df)}</strong>. Valid observations used for volume analysis: <strong>{len(volume_df)}</strong>.</p>
        </div>
        {"".join(html_sections)}
    </div>
    """


def main() -> None:
    all_findings = []
    company_sections = []
    nav_items = []

    for position, symbol in enumerate(SYMBOLS):
        company_name = COMPANY_NAMES.get(symbol, symbol)
        df, volume_df = load_and_prepare(symbol)

        all_findings.extend(compute_findings(symbol, df, volume_df))

        charts = build_charts(symbol, company_name, df, volume_df)

        prefix = anchor_prefix(symbol)
        image_dir = OUTPUT_DIR / f"images_{prefix}"
        image_dir.mkdir(parents=True, exist_ok=True)
        for anchor, _title, _description, figure in charts:
            figure.write_image(image_dir / f"{anchor}.png", width=1400, height=800, scale=2)

        nav_items.append(
            f'<li><strong>{company_name} ({symbol})</strong><ul>'
            + "".join(f'<li><a href="#{anchor}">{title}</a></li>' for anchor, title, _, _ in charts)
            + "</ul></li>"
        )

        company_sections.append(render_symbol_section(symbol, company_name, df, volume_df, charts, is_first_symbol=(position == 0)))

    findings_df = pd.DataFrame(all_findings)
    findings_df.to_csv(FINDINGS_FILE, index=False)

    report = f"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Market Data Analytics Dashboard</title>
<style>
body {{ font-family: Arial, Helvetica, sans-serif; max-width: 1200px; margin: 0 auto; padding: 30px; line-height: 1.5; }}
h1 {{ margin-bottom: 10px; }}
h2 {{ margin-top: 80px; border-top: 3px solid #0645ad; padding-top: 20px; }}
h3 {{ margin-bottom: 10px; }}
section {{ margin-top: 50px; scroll-margin-top: 20px; }}
.company {{ scroll-margin-top: 20px; }}
.chart-description {{ font-size: 16px; color: #444; margin-bottom: 20px; max-width: 1000px; }}
.note, .summary {{ padding: 15px; background: #f4f4f4; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 30px; }}
a {{ color: #0645ad; }}
nav ul {{ columns: 2; }}
</style>
</head>
<body>

<h1>Market Data Analytics Dashboard</h1>

<div class="note">
<p><strong>Purpose:</strong> This dashboard contains candidate charts and findings generated from transformed Fauxnance candle data for each symbol in scope. The charts are exploratory and support the business claims recorded in <code>claims.md</code>.</p>
<p><strong>Data treatment:</strong> Synthetic observations and rows without recorded volume are excluded from volume-based calculations. OHLC-derived measures use the available opening, high, low and closing prices.</p>
</div>

<nav>
<h2 style="margin-top:0;border-top:none;">Contents</h2>
<ul>
{"".join(nav_items)}
</ul>
</nav>

{"".join(company_sections)}

</body>
</html>
"""

    REPORT_FILE.write_text(report, encoding="utf-8")

    print(f"Dashboard: {REPORT_FILE}")
    print(f"Candidate findings: {FINDINGS_FILE}")
    print(f"Symbols: {', '.join(SYMBOLS)}")


if __name__ == "__main__":
    main()
