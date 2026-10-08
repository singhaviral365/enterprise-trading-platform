# 13 · Portfolio: more useful charts, and a page structure that does not grow forever

Status: **plan**. Two parts that belong together: what to draw (section 3) and where it lives (section 4).

## 1. Today

The Portfolio page (`features/portfolio`) is one long scroll, top to bottom:
1. Summary tiles (Total value, Cash, Market value, Unrealised, Realised, Today)
2. **Performance** card: the NAV line chart with range buttons and benchmark toggle, stat tiles (return, P&L, annualised, max drawdown, best and worst day) and a **Daily statements** table
3. **Holdings**: cards or table, the split-view detail with Buy / Sell
4. **Profit and loss by instrument**: a table with a date filter

Charts: only **one** on the page (the NAV line) plus the dashboard's donut. Tables carry everything else. Tools we already have: `LineChart` and `DonutChart` (both Highcharts 13, loaded lazily,
styled with design tokens), a year of **daily OHLC candles** per instrument (`GET /api/v1/market/candles/{symbol}`: open, high, low, close, volume), and the stored daily account statements.

## 2. Principle

A chart earns its place only if it answers a question the tables cannot answer at a glance. For each visual below: the **question**, the **data** it uses, and whether it needs a new API.

## 3. Candidate visuals

| # | Visual | Question it answers | Data and API | Where it fits best |
|---|---|---|---|---|
| V1 | **Allocation donut** with a switch: by instrument / by currency | "Where is my money, and am I concentrated?" | Priced holdings (`GET /portfolio/{id}`): market value per position (already loaded). Tooltip shows value and share; centre shows total | Overview |
| V2 | **Today's movers treemap**: one block per holding, **size = market value, colour = today's change** | "What moved today, and does it matter to me?" | Priced holdings: market value and day P&L %. Needs Highcharts `treemap` module | Overview |
| V3 | **Contribution bars**: who made and who lost the money (horizontal bars, sorted, green and red) | "Which holdings explain my profit?" | `GET /portfolio/{id}/pnl?bySymbol=true`: realised + unrealised + total per instrument (already loaded for the P&L table) | Overview |
| V4 | **Value over time, stacked**: cash and holdings as two areas (and optionally a line for money invested) | "How much of my account is working in the market vs sitting in cash?" | Stored daily statements already have `cash`, `holdings_value`, `cost_basis`; the performance points do not expose them yet: **add three additive fields** (`cash`, `holdingsValue`, `costBasis`) to `PerformancePoint` | Performance |
| V5 | **Daily P&L columns**: one bar per day (green up, red down) with a cumulative-realised line | "Is my result steady or driven by a few days?" | Statements: `dayPnl`, `realisedPnlCumulative` (already in the points) | Performance |
| V6 | **Drawdown ("underwater") area** | "How deep were the falls and how long to recover?" | Computed from the NAV series in the browser (peak-to-date minus current, as %); the max drawdown tile already exists | Performance |
| V7 | **Monthly return heat strip** (months as cells, colour = return) | "Which months were good or bad?" | Computed from the NAV series; with less than a year of history show only the months that exist. Needs the Highcharts `heatmap` module (or plain CSS cells) | Performance |
| V8 | **Candlestick chart per instrument**, with volume, **your average cost as a dashed line** and **your buys and sells as markers** | "Where did I buy relative to the price action?" | Candles: existing market candles endpoint (open/high/low/close/volume). Average cost and order fills: the position and the order history already loaded. Needs the Highcharts Stock module (`candlestick`, `ohlc`) | **Holdings detail** (and an optional Line / Candles toggle on the Market quote chart) |
| V9 | **Realised P&L over time** (bars per sale, or a cumulative line) | "What have I actually banked, and when?" | Realised ledger entries (`/portfolio/{id}/realised`, already used) or the cumulative column | P&L page |
| V10 | **Price range bar in the holdings table**: where today's price sits between the 52-week low and high (tiny inline bar per row) | "Is it near its high or its low?" | Candles' high/low over a year (one candle call per held symbol, cached, already used by the quote screen) | Holdings |
| V11 | **Benchmark comparison** (exists) and **excess return** shading between the lines | "Did I beat the market?" | Already available | Performance |

Not recommended now: return histogram, rolling volatility/Sharpe (these invite over-interpretation and need more history than most accounts have), correlation matrix (needs several years of data).

### Making them beautiful and consistent
- One look: tokens only for colours (the `--data-*` and status tokens), no shadows, rounded cards, soft grid lines, no 3D, no gradients on data; both themes (Highcharts styled mode, as `LineChart`/`DonutChart` do already).
- Green and red mean gain and loss everywhere; blue/primary is for "your" series (NAV, average cost line).
- Every chart: a title that states the question, a one-line takeaway under it ("Top 3 holdings are 68% of your portfolio"), a tooltip with exact numbers in the user's currency/format, keyboard-reachable data (a "View as table" toggle) and a text alternative (`role="img"` + `aria-label` summarising it), `prefers-reduced-motion` respected.
- Shared building blocks (so each chart is a thin wrapper): `BarChart`, `AreaChart`, `Treemap`, `CandleChart` next to the existing `LineChart` and `DonutChart`, all using the same lazy Highcharts loader and token styling.
- Highcharts modules: `treemap`, `heatmap`, and `stock` (candlestick/OHLC) are separate lazy imports, so the charts cost nothing until a page draws them.
- **Licence check:** Highcharts is free for non-commercial use; a commercial launch needs a licence. Worth knowing before building more on it; the alternative is another library with the same wrapper approach.

## 4. Page structure: Overview stays rich, the rest moves out

The page is long because it holds four jobs. Split by job, using **routes** (deep-linkable, lazy-loaded) with a shared header and a **tab bar** under the title; the sidebar keeps one **Portfolio** entry.

| Tab / route | Job | Contains |
|---|---|---|
| **Overview** `/portfolio` | The 10-second picture | Summary tiles, a **compact NAV chart** (range buttons, benchmark), **Allocation donut (V1)**, **Today's movers treemap (V2)**, **Contribution bars (V3)** and the stat tiles (return, drawdown, best/worst day). Links "See all" to the other tabs |
| **Holdings** `/portfolio/holdings` | Manage what I own | The card/table list with the split-view detail, Buy / Sell, **candlestick (V8)** and the **52-week range bar (V10)** |
| **Performance** `/portfolio/performance` | How I did over time | Full NAV chart with all ranges and benchmark, **stacked value (V4)**, **daily P&L (V5)**, **drawdown (V6)**, **monthly strip (V7)**, and the **Daily statements** table |
| **Profit and loss** `/portfolio/pnl` | What I made, instrument by instrument | The P&L table with its date filter, **realised over time (V9)**, and CSV export (see plan 11, idea G) |

Why this split:
- **Holdings is the thing people act on**, and it already has its own complexity (cards/table, split view, the assistant on the quote). Giving it its own tab again (as the old Positions page did) keeps the overview calm.
- **Overview** gets only visuals that answer a question in seconds; the heavier analytics (stacked value, drawdown, heat strip, statements) are one click away on **Performance**.
- **Profit and loss** is a table-first, filter-first task; the date filter and export belong together.
- The summary tiles stay on **every** tab (they are the page header), so context is never lost.

Routing and navigation details:
- `app.routes.ts`: `portfolio` becomes a parent with lazy children (`''` overview, `holdings`, `performance`, `pnl`) sharing a `PortfolioShell` (title, "prices as of", Refresh, tiles and the tab bar; the tab bar is a `nav` with `aria-current="page"`).
- `/positions` currently redirects to `/portfolio`; point it to `/portfolio/holdings`. The dashboard's **Positions** stat card and any "View portfolio" links go to `/portfolio/holdings` or `/portfolio` as fits.
- State is shared through the existing `PortfolioStore` (so switching tabs does not refetch); each tab loads its own extras on demand (performance series, pnl breakdown).
- Notifications and strategy messages that deep-link to a holding use `/portfolio/holdings?symbol=AAPL` (opens the detail).
- `e2e/` journeys that click through the Portfolio page need their paths updated.

## 5. API and data additions (all additive and optional)
| Change | For |
|---|---|
| `PerformancePoint`: `cash`, `holdingsValue`, `costBasis` (already stored in `portfolio_nav_daily`) | V4 |
| Optional `GET /api/v1/portfolio/{id}/performance?...` unchanged otherwise | |
| Nothing new for V1-V3, V5-V7, V9 (existing data), nothing new for V8/V10 (existing candles) | |
| `portfolio-performance-api.yaml`, `CONTRACT-CHANGES.md`, `npm run api:generate` | The only contract change |

## 6. Work breakdown (suggested order)
1. **Structure first** (no new charts): `PortfolioShell`, child routes, move Holdings, Performance and P&L into their own components, fix links and e2e paths. Existing specs move with their components. This alone fixes the length problem.
2. **Shared chart wrappers**: `BarChart`, `AreaChart` (both on the existing token styling), with specs using the fake Highcharts loader.
3. **Overview visuals**: V1 allocation, V3 contribution bars, then V2 treemap (module).
4. **Performance visuals**: V5 daily P&L, V6 drawdown, then V4 (after the API fields), then V7.
5. **Holdings detail**: V8 candlestick with average-cost line and trade markers, V10 range bar.
6. **P&L tab**: V9 and export.
7. Docs: `DESIGN_SYSTEM.md` (chart components and rules), a new "Charts" subsection, and `documentation/flows/portfolio-and-nav.md` (what each chart means).
8. Visual and accessibility pass: light/dark, narrow widths (charts reflow to one column), keyboard, screen-reader summaries, empty and partial-data states (no history yet: show what exists and say why).

## 7. Acceptance criteria
- The Overview fits in about two screens and each visual states its takeaway; nothing on it is a table of more than a few rows.
- Every old capability is still reachable (holdings with Buy/Sell, P&L filter, daily statements, benchmark), at its own route.
- New visuals work in both themes, with `View as table` and text alternatives, and degrade cleanly with partial or estimated data (estimated days marked).
- Tab switching does not refetch shared data; each route is lazy.

## 8. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Tabs under one "Portfolio" sidebar item, or separate sidebar items for Holdings and Performance? | Tabs under Portfolio (one item, shared header) |
| D2 | Candlestick on the Market quote chart too (Line / Candles toggle)? | Yes, small once V8 exists |
| D3 | Treemap and heatmap need more Highcharts modules and the licence question | Build V1/V3/V5/V6 first; add V2/V7 if the licence and the look are fine |
| D4 | Do the three new fields on the performance points go in the existing route? | Yes, additive and optional |
