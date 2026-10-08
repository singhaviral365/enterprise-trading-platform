# 11 · Feature ideas that fit the platform

Status: **ideas and a recommended shortlist**; nothing here is decided or started.

## 1. What the platform is today (so ideas fit it)

| Area | Where | What it has |
|---|---|---|
| Sign-in, sessions | auth-service (3000) | Register, login with optional two-step email code, password reset, HttpOnly cookie sessions |
| Accounts, orders | order-service (8081) | Account link/create, market and limit orders, order history, cancel |
| Execution, market data | executor-service (8082) + Kafka (9092) | Fills orders, settles, polls Fauxnance quotes, live market board |
| Portfolio | order-service `portfolio` | Priced holdings, unrealised/realised/day P&L, EOD statements, NAV curve and benchmark |
| Signals | order-service `signals` | SMA20/SMA50/RSI14 BUY/SELL/HOLD with strength, plain-words explanation, optional Gemini chat |
| Strategies | order-service `strategy` + executor worker | Price-trigger rules that place orders unattended |
| Watchlist and notifications | order-service | Watchlist with price alerts; in-app inbox, bell; email (dev); preferences (currency, formats, categories, AI switch) |
| Frontend | Angular app (4200) | Dashboard, Market data, Portfolio, Order history, Strategies, Notifications, Settings |

## 2. The rules every idea must respect

| Constraint | How the ideas below comply |
|---|---|
| **No new microservice, no new port** | Everything lives in the existing three services (almost all in the order-service) and the Angular app |
| **Nothing existing changes behaviour** | New routes and fields are **additive and optional**; no existing contract field is renamed or made required; each backend piece sits behind a switch (`feature.x.enabled`, like `portfolio.performance.enabled`) |
| **House rules in code** | Portfolio stays read-only and independent (`PortfolioIndependenceTest`, `PortfolioIsReadOnlyTest`); strategy code never places orders itself (`StrategyBoundaryTest`); orders only through `POST /api/v1/orders`; Fauxnance quota is shared (2,000 a day), so new features reuse the candle and quote caches and never call the vendor per user |
| **Seamless in the UI** | New things appear **inside screens people already use** (the order ticket, quote detail, strategy form, dashboard, Portfolio), use the design system, shared components and tokens, and need no new navigation item unless noted |
| **Privacy** | The AI assistant switch (Settings) still decides whether anything about a customer goes to Gemini |

## 3. Ideas, ranked by "meaningful x simple x stands out"

Effort: S = a few days, M = about a week or two. All frontend+backend work follows the repo's usual tests and contract-first rule.

### A. Strategy preview ("what would this have done?")  *(M, high wow)*
- **What the user sees:** in the New strategy form (see plan 10), under the summary sentence: *"Over the last year this rule would have triggered 3 times. Average move after each: +4.2% after 10 days."* A small chart of the year with the trigger line and markers where it would have fired.
- **How it plugs in:** the order-service already caches a year of daily candles per symbol for signals (`CandleCache`) and for the quote-detail chart. A new read-only route
  `GET /api/v1/strategies/preview?symbol&direction&price` (in the strategy contract) scans the candles for **crossings** of the level (same "crossed, not already past" definition the executor uses) and reports count, dates and the follow-through. No orders, no new tables, no new vendor calls.
- **Why it stands out:** it turns a form into a decision aid and teaches what "falls through a level" means; it also exposes silly rules (a level that would never trigger).
- **Risk:** past behaviour is not a promise: always show "Past prices; not a forecast".

### B. Pre-trade impact in the order ticket  *(S, high value)*
- **What the user sees:** below the quantity, a compact "After this order" block: cash left, share of the portfolio this holding would be, the new average cost (for a buy), and for a sell the profit locked in (realised) at the current price.
- **How it plugs in:** pure frontend arithmetic over data the app already holds (account balance, positions, priced portfolio). The sell P&L uses the average cost and quantity already in the position.
- **Risk:** none for the backend; label it an estimate (market order).

### C. Portfolio health card  *(S-M, high value)*
- **What the user sees:** on the dashboard and Portfolio page: allocation by instrument and currency, a "concentration" note ("42% of your portfolio is in one stock"), cash share, and from the NAV curve: volatility (how bumpy), max drawdown (already available) and best/worst day. A single plain-language line per finding.
- **How it plugs in:** allocation from the priced holdings (`GET /portfolio/{id}`); risk numbers from the stored NAV series (`/performance`). Either compute in the frontend or add an additive `insights` section to the portfolio response behind a flag. Reuses the donut chart component.
- **Risk:** words matter: describe, never advise ("is" not "should").

### D. Daily and weekly portfolio digest (in-app, email in dev/prod)  *(M, polished)*
- **What the user sees:** one notification each evening or Monday: *"Yesterday: +$132 (+0.8%). Biggest mover: NVDA. 1 strategy ran."* Opt-in category in Settings, default off.
- **How it plugs in:** the nightly `NavJob` already writes the closed-day statement (value, day P&L); the notifications module already has an outbox, categories, preferences and (see plan 01) email. A new category `PORTFOLIO_DIGEST` is one enum value, one preference column and one small scheduled job in the order-service.
- **Risk:** needs plan 01's email modes for real inboxes; in-app works today.

### E. Signal change alerts  *(M)*
- **What the user sees:** for instruments on the watchlist: *"AAPL moved from HOLD to BUY."* A signal chip next to watchlist rows and in the market board (lazy: only for visible rows).
- **How it plugs in:** the signals module already computes and caches the signal per symbol; a scheduled job compares today's direction with the last stored one for **watchlisted symbols only** and raises an in-app notification through the existing watchlist-alert path. A tiny table (`signal_last_seen`: symbol, direction, date) is the only new storage.
- **Risk:** candle quota: watchlisted symbols only, one candle call per symbol per day (cache already covers it).

### F. Trade journal: a note on every order  *(S-M)*
- **What the user sees:** in the order detail and order history, an optional "Why?" note and a tag ("earnings", "long-term"). Later, a review: *"Orders you tagged 'earnings': 5, +1.8% on average."*
- **How it plugs in:** one nullable column or a small `order_note` table in the order-service, an additive `PATCH /orders/{id}/note` route, and a field in the order history table. Nothing in order placement changes.
- **Why it stands out:** retail platforms rarely help people learn from their own decisions.

### G. Export your data (CSV)  *(S, very practical)*
- **What the user sees:** "Export" on Order history, Realised P&L and the Daily statements table.
- **How it plugs in:** client-side CSV from the data each page already loaded (no new API), with formatting from the user's preferences; optionally a streamed server CSV for a full history later.
- **Risk:** large histories; page through the existing endpoints.

### H. Command palette (Ctrl+K)  *(S, delightful)*
- **What the user sees:** press Ctrl+K anywhere: type "aapl" to open its quote, "buy" to jump to the ticket, "settings", "strategies". Fully keyboard accessible.
- **How it plugs in:** a frontend-only overlay using the router, the market board data and the account store; built from the shared dialog/sheet components.

### I. Alert to strategy in one click  *(S)*
- **What the user sees:** on a watchlist price alert: "Trade automatically when this happens" which opens the (new, simple) strategy form pre-filled with the instrument, direction and price.
- **How it plugs in:** frontend only; both features already exist.

### J. "Explain my portfolio" with the assistant  *(M, only with the AI switch on)*
- **What the user sees:** a button on Portfolio: *"Summarise this month"*. The assistant describes, from numbers only, what moved the value and how it compares with the benchmark.
- **How it plugs in:** reuses the Gemini client, rate limits and the strict "no advice, no predictions" prompt of the signals module; input is aggregate figures (NAV stats, top movers), never names or ids. Needs its own wording review.
- **Risk:** AI cost/quota and compliance wording; keep it behind the existing switch.

### Considered and not recommended now
| Idea | Why not |
|---|---|
| Social features, leaderboards, copy trading | Privacy and moderation load; changes the product |
| Real-time streaming charts (WebSockets) | A new transport and port-level change; polling is enough for this data |
| More indicators (MACD, Bollinger) | Already marked "deferred" in SIGNALS.md; each needs its own explanation |
| Real payments/deposits | Out of scope; the NAV design assumes none |
| Push/SMS | Needs a provider; email plan comes first |

## 4. Recommended shortlist (best value for least risk)

| Order | Idea | Why first |
|---|---|---|
| 1 | **B** Pre-trade impact | Frontend only, instantly useful, no risk to anything existing |
| 2 | **A** Strategy preview | The most distinctive: ties candles, signals and strategies together; pairs with the form simplification (plan 10) |
| 3 | **C** Portfolio health | Makes the existing NAV and holdings data feel like insight |
| 4 | **H** Command palette and **G** Export | Small, broadly loved polish |
| 5 | **D** Digest and **E** Signal change alerts | Make the notification system proactive; D waits for the email plan for inbox delivery |
| Later | **F** Journal, **I**, **J** | Good, but each is a smaller audience or needs wording review |

## 5. How each would integrate (checklist used for any of them)
1. **Contract first:** an additive route or field in the relevant `contracts/*.yaml`, a line in `CONTRACT-CHANGES.md`, regenerate the client.
2. **Own package, own switch, own tests** in the order-service (or purely frontend); an architecture test if it touches portfolio or strategy code.
3. **Reuse caches and stores:** `CandleCache`, `QuoteCache`, `AccountOverviewStore`, `PortfolioStore`, notification outbox, preferences.
4. **UI inside an existing screen**, shared components, tokens, no shadows, light and dark, AXE-clean.
5. **Failure containment:** the feature can be off or down without affecting trading, the portfolio routes or sign-in.

## 6. Questions for you
1. Which of A-J do you want planned in detail first? (My vote: B, then A.)
2. Is any of them off limits for the course/brief you are working to (for example anything that sounds like advice)?
3. Do you want the first two as one small release together with the strategy form (plan 10)?
