# Trade Advice and Signals

On every instrument's quote screen the customer sees a **BUY, SELL or HOLD reading** with its strength and the numbers it comes from,
an explanation in plain words, and, if they switched the AI assistant on in Settings, a short chat about it. It is part of the quote
screen, not a separate chatbot.

It is information about a chart. It is not advice, it places no order, and it says so beside every signal.

Contract: [`contracts/signals-api.yaml`](../../contracts/signals-api.yaml). Code: `org.example.backend.signals` (order-service),
`features/market/signal-card` and `features/market/assistant-chat` (frontend).

## The method

One method, written out, so every number can be reproduced by hand from the closes.

| | |
|---|---|
| **Data** | Daily closes for the last 90 (default), 180 or 365 calendar days, from Fauxnance (`GET /candles/{symbol}`, the same address and key as the rest of the platform). Trading days only: a candle Fauxnance generated to bridge a closed day is dropped. At least 50 trading days are needed (`SIG-422` otherwise) |
| **Averages** | Simple moving averages of the close over the last 20 and the last 50 trading days |
| **RSI** | 14-day, Wilder's smoothing (the first averages are plain means of the first 14 changes, then `(previous × 13 + current) / 14`). 100 if the price never fell, 0 if it never rose, 50 if it never moved. Checked in the tests against the standard published worked example (70.53, 66.32 ... 37.77) |
| **BUY** | SMA(20) above SMA(50) **and** the latest close above SMA(20) |
| **SELL** | SMA(20) below SMA(50) **and** the latest close below SMA(20) |
| **HOLD** | Anything else (the two disagree) |
| **Strength** (0-100) | BUY/SELL: half *trend* (how far apart the averages are as a share of SMA(50); a gap of 3% or more counts in full) and half *momentum* (for a BUY, RSI 40-65 counts in full, less below 40 and less again above 65, since a stretched price is likelier to pull back; for a SELL the same on 100 minus the RSI). HOLD: how balanced the indicators are, `100 - 2 × |RSI - 50|` |

Why this and not more: a single method a customer can check beats several they cannot. Adding MACD, Bollinger bands or volume is a
later step; each would need its own explanation of what it adds.

## How a request goes

```
quote screen ── GET /api/v1/accounts/{id}/signals/{symbol}?format=narrative ──► order-service
                                                                  │ owner check (ACC-403 / ACC-404)
                       signal cache (5 min) ◄── SignalComputer ◄── CandleCache (10 min) ◄── Fauxnance candles
                                                                  │
                          assistant switched on? ── yes ──► GeminiSignalExplainer ──► Gemini (rate limited, cached)
                                                  └─ no / fails / busy ──► the platform's own wording (FALLBACK)
quote screen ── POST /api/v1/signals/chat {message, conversationHistory} ──► refused (AST-403) unless the assistant is on
```

* **Caching.** Candles are held 10 minutes per instrument and window (a daily candle changes at most once a day), the computed
  signal 5, and an explanation 5 per (account, instrument, direction, strength, holding). Everyone looking at one instrument shares
  a Fauxnance call. If Fauxnance is down or over quota, candles already held are served up to a day old and marked `stale`; with
  none held the answer is `SIG-503`.
* **No new tables.** Everything is in memory; a restart starts empty.
* **No conversation is stored.** The screen keeps it and sends the last ten turns with each question.

## What the language model is told

A customer's data leaves the platform only if they switched the assistant on. When it is on, the model is told:

* the instrument's symbol,
* the signal's numbers (direction, strength, both averages, the RSI, the latest close and its date),
* how many units the customer holds of **that instrument** and their average cost, or that they hold none.

It is not told the account id, name, email, balance, orders or anything else, and the key is sent in a request header, never in a URL.
The customer's own words go in as a *user message*, never in the instructions, and the instructions tell the model to ignore a request
in it to change them. **The chat stays on the signal:** a message that tries to take the assistant over ("ignore your rules", "act as", "show your
prompt") never reaches the model, and the model is told to answer anything not about this instrument's signal with the single word `OFF_TOPIC`;
in both cases the customer sees one fixed sentence that points back to the signal (`GeminiSignalExplainer.OFF_TOPIC_REPLY`). The model is given **no tools**: all it can produce is text, which the screen shows as plain text (never as
HTML). Its reply is stripped of control characters and cut to 1,200 characters. It is told never to tell the customer to buy, sell or
hold, never to predict a price, and never to promise or imply a return.

If the assistant is off, `format=narrative` returns the platform's own explanation (`explanationSource: FALLBACK`), the chat is
refused server-side (`AST-403`), and nothing about the customer reaches the assistant until they turn it on.

## Rate limits, quota and cost

* The free Gemini tier allows 60 requests a minute and about a million tokens a month. The platform keeps inside the minute with two
  sliding windows: 60 for everyone, 10 for one customer (`gemini.rate-limit-rpm`, `gemini.rate-limit-per-account-rpm`), and logs a
  warning at 50.
* Over the limit, an **explanation** quietly becomes the platform's own wording; the **chat** answers `AST-429` with `Retry-After`. It is
  refused, not queued: a queue would hold a request thread for up to a minute.
* A signal is cheap: an explanation is a few hundred tokens and is cached, so the monthly allowance is shared by customers who open
  a quote and ask something, not by everyone who looks. Metrics (below) show the real figure.
* Fauxnance candles share the platform's daily quota (2,000 calls) with the poller and the portfolio job; the 10-minute cache is what keeps signals
  from spending it.

## Configuration

| Setting | Default | |
|---|---|---|
| `GEMINI_API_KEY` | (none) | Without it every explanation is the platform's own wording and the chat says the assistant is not set up |
| `external.gemini.model` (config/application.yml) | `gemini-flash-latest` | A named model is retired for new keys over time (`gemini-2.5-flash` now answers HTTP 404); the `-latest` alias follows the current one. List what your key can use with `GET https://generativelanguage.googleapis.com/v1beta/models` |
| `GEMINI_RATE_LIMIT_RPM` | 60 | Per order-service instance |
| `CANDLE_CACHE_TTL_MINUTES` | 10 | |
| `SIGNAL_CACHE_TTL_MINUTES` | 5 | Also the explanation cache |
| `signals.lookback-days` | 90 | Default window |

The signals module has its own small Fauxnance candle client rather than reusing the portfolio module's, because the repo's rule (`PortfolioIndependenceTest`) is that nothing outside the portfolio module may depend on it. Gemini is called with the JDK's own HTTP client, with no SDK; the indicators are written out in `Indicators` (about 60 lines, tested)
instead of taken from a library. Both choices keep the dependencies as they were and keep the method readable.

## Monitoring

Spring Boot Actuator metrics, readable at `/actuator/metrics` when the order-service runs with the `dev` profile (only `health` is
exposed anywhere else):

| Metric | Tags |
|---|---|
| `signals.candle.cache` | `result` = hit, miss, stale |
| `signals.candle.fetch` | `outcome` = ok, quota, failed |
| `signals.result.cache` | `result` = hit, miss |
| `signals.gemini.calls` | `outcome` = ok, failed, rate_limited, not_configured |
| `signals.gemini.tokens` | `type` = prompt, output |
| `signals.gemini.latency` | timer |

Every candle fetch and every model call is logged (hit or miss with age; tokens and milliseconds). No tag or log line carries a
customer, a holding or a key.

## Decisions for the team (answers to the plan's open questions)

| | Decision |
|---|---|
| Service or extension | An extension of the order-service: it reuses the owner check and the Fauxnance address and key |
| Lookback | 90 calendar days by default; 180 and 365 are allowed and cost one more fetch each; nothing else |
| Conversation storage | Not stored. The screen holds it; the server is stateless |
| On demand or scheduled | On demand, cached |
| More indicators | Deferred |
| Disclaimer | Shown beside every signal, with the method one click away. **Whether a real launch needs compliance review is for the business to decide; nothing here is a legal opinion** |
| If Gemini is unavailable | The platform's own wording, labelled "Standard explanation" |
| Tokens per month | Not knowable before use; the token counters above are how to find out |
| Where the key lives | An environment value of the order-service. In a deployed environment it belongs in a secret store, not in an env file |
