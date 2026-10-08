# 16 · The Account Assistant: a second chatbot that knows your account and takes you to the answer

Status: **plan**. Builds on the signals assistant (same `GEMINI_API_KEY`, same switch in Settings) but is a different product with a different job.

## 1. What it is, and how it differs from the signal chat

| | **Signal advisor chat** (exists) | **Account Assistant** (this plan) |
|---|---|---|
| Question it answers | "What does this instrument's trend say?" | "What happened in **my** account?" |
| Knows about | One instrument's indicators, and your holding in it | Your orders, positions, balance, P&L, performance, strategies, notifications, settings |
| Lives | Inside the quote detail (and, per plan 05, in its own pane) | A **global drawer** you can open from any page |
| Output | Text | Text **plus actions**: a link that opens the exact screen, already filtered |
| Data it may read | Only the signal numbers and one holding | Read-only account data through a fixed set of **tools** |

Same rules for both: nothing is sent unless the customer switched the AI assistant on in Settings; neither can place an order; neither gives advice.

## 2. What it can do (examples, and what the customer sees)

| Customer asks | Assistant does | Customer sees |
|---|---|---|
| "When did I place an order for AAPL on 3 October?" | Looks up orders (symbol AAPL, that date) | "You placed a market BUY of 5 AAPL on 3 Oct at 14:02; it was filled at $331.20." + button **Show these orders** (opens Order history filtered to AAPL, 3 Oct) |
| "Show my rejected orders this month" | Looks up orders (status REJECTED, month) | Count, the reasons in words, **Show these orders** |
| "Which holding has lost me the most?" | Reads the P&L by instrument | "INFY.NS: -$84 unrealised." + **Open Profit and loss** |
| "How did I do last month?" | Reads performance for the range | Return, P&L, best/worst day, a button to the Performance tab |
| "Why didn't my AAPL strategy run?" | Reads the strategy and its run trail | "It's still waiting: AAPL is at 331, your level is 150 (falls to or below)." or the recorded outcome ("Blocked: the order would cost more than your cap") + **Open this strategy** |
| "What did I miss?" | Reads unread notifications | A short list grouped by category + **Open unread notifications** |
| "How much cash do I have, and how much is in AAPL?" | Reads balance and positions | Two numbers and the share of the portfolio |
| "Where do I change my date format?" | Knows the app's map | **Open Settings > Display** |
| "What does 'unrealised' mean?" | Answers from the plain-language flow documents | A short explanation; no account data used |
| "Set up a rule: buy 5 AAPL if it falls to 150" | **Drafts** it | "I've prepared this. Review and create it." + button that opens the New strategy form **pre-filled** (never creates it) |

Three families: **find** (lookups that end in a deep link), **explain** (numbers and terms in words), **draft** (pre-fill a form for the customer to confirm). There is no "do": the assistant never writes.

## 3. Architecture

### 3.1 Tool calling (recommended) rather than stuffing data into the prompt
Gemini supports **function calling**: we describe a small set of tools; the model decides which to call with which arguments; **our server runs them**, returns the results, and the model writes the answer.

```
drawer ── POST /api/v1/assistant/chat {message, history, page} ──► order-service (assistant module)
            account = the token's account (never from the request or the model)
            loop (at most 4 tool rounds):
               Gemini: "call list_orders(symbol=AAPL, from=2026-10-03, to=2026-10-03)"
               server: validates arguments, runs the read-only tool for THIS account, caps the rows
               Gemini receives the rows (as data) and either calls another tool or answers
            ◄── {reply, actions:[{type:'OPEN_ORDERS', label:'Show these orders', params:{symbol,from,to}}], toolsUsed:['list_orders']}
```

Why this and not "send the last 200 orders every time": it sends **only what the question needs**, it works for a history of any size, it is the same code path for every question,
and it keeps the data leaving the platform small and auditable. The cost is more than one model call per question (see 7).

### 3.2 The tools (all read-only, all scoped to the signed-in account)
| Tool | Arguments (validated) | Backed by | Result cap |
|---|---|---|---|
| `list_orders` | symbol, side, status[], from, to, min/max quantity, limit | `TradeService` order history | 20 rows + total count |
| `get_order` | order id | `TradeService` | 1 |
| `get_balance` | none | `TradeService.getBalance` | 1 |
| `list_positions` | none | `TradeService.getPositions` | 50 |
| `get_portfolio_summary` | none | portfolio read facade (see 3.5) | 1 |
| `get_pnl` | symbol?, from, to | portfolio read facade | 50 |
| `get_performance` | range | portfolio read facade | summary only (return, P&L, drawdown, best/worst) |
| `list_strategies` / `get_strategy_runs` | strategy id, limit | `StrategyService` | 20 / 20 |
| `list_notifications` | read state, category, from, to, limit | notifications service | 20 |
| `get_quote` / `get_signal` | symbol | the existing quote and signal services | 1 |
| `propose_action` | `type` from a fixed enum (OPEN_ORDERS, OPEN_ORDER, OPEN_HOLDINGS, OPEN_PNL, OPEN_PERFORMANCE, OPEN_STRATEGIES, OPEN_STRATEGY, OPEN_NOTIFICATIONS, OPEN_SETTINGS, DRAFT_STRATEGY, DRAFT_ORDER) plus typed params | Pure validation: returns the action for the reply | n/a |

`propose_action` is how links happen. The model never writes a URL: it names an action type and parameters, the **server validates them against the allow-list**, and the **frontend** turns an
approved action into a router navigation. A made-up route or parameter is dropped.

### 3.3 The contract and the code
- New `contracts/assistant-api.yaml` (one route, `POST /api/v1/assistant/chat`; request: `message` up to 500 characters, `conversationHistory` last 10 turns, optional `page` context
  `{route, symbol?, orderId?}`; response: `reply`, `actions[]`, `toolsUsed[]`); errors reuse the signal catalogue's meaning with their own prefix: `AST-403` (switched off), `AST-429` (busy), `AST-503` (not set up / model unavailable), `AST-422` (bad input).
- New package `org.example.backend.assistant` in the order-service (controller, service, tool classes, DTOs, config), its own switch `assistant.account.enabled`, own README, own tests, exactly like `signals` and `portfolio`.
- **Share the model client instead of copying it.** Move `TextGenerator`, `GeminiClient`, `AssistantRateLimiter` (today inside `signals.explain`) to a small neutral package (for example `org.example.backend.ai`) used by both modules; extend `TextGenerator` with a tool-calling method (declarations in, text or function calls out). The signals tests keep passing by import changes only.
- No new service, no new port, no new table (conversations are not stored).

### 3.4 Guard rails (these are the part that must be right)
| Risk | Control |
|---|---|
| Reading another customer's data | The account id comes from the verified token (`AccountAccess`/`ACC-403` as every route), **never** from the request body or the model's arguments. A tool has no account parameter |
| The model writing something | **No write tools exist.** An architecture test fails the build if the assistant package imports order placement, cancel, strategy create/update, preferences update or any mapper insert/update |
| Prompt injection through data (an order symbol, a notification text, a strategy name) | Tool results are passed as data in a clearly delimited part; the system prompt says tool output is untrusted; no tool output can reach `propose_action` except through the model's own validated call; text shown to the customer is plain text (never HTML), cut and stripped as in the signal chat |
| Leaking more than needed | Rows are trimmed to the fields a question needs; **no account number, name, email, phone, ids beyond order ids** go to the model; amounts and symbols only. Row and token caps per tool |
| Over-trusting the model's maths | Totals and counts come from the tools (computed by the server), and the prompt says to quote them rather than recompute |
| Advice and predictions | Same instructions as the signal assistant: describe, do not recommend, no price forecasts, no promised returns; a drafted action is "prepared for your review", never "you should" |
| Cost and abuse | Shared global limit (60/min) plus a lower **per-account limit for this assistant** (for example 6 questions a minute), a cap of 4 tool rounds per question, a cap of 500 characters per message; over the limit `AST-429` with `Retry-After` |
| Data retention at the provider | Free-tier terms of a hosted model can allow the provider to use prompts to improve its products. Check the terms of the tier in use before sending real customer data; keep what is sent minimal (above); say what is sent in the first-use notice |
| Switch off | `aiAssistantEnabled=false` makes the route answer `AST-403` server-side (not only a hidden button); nothing is sent |

### 3.5 Architecture rules in the repo that this touches
- `PortfolioIndependenceTest` says nothing outside `portfolio` may import it. The assistant needs portfolio numbers. Options: **(a)** a tiny read-only `PortfolioReadFacade` inside `portfolio` and a named exception for the assistant package in the test (recommended: the rule exists to protect order placement and module independence, and a read-only facade keeps both), **(b)** the assistant calls the portfolio HTTP route in-process with the customer's token (no import, but slower and clumsier), **(c)** leave portfolio tools out of phase 1. Decision D2.
- `StrategyBoundaryTest` concerns strategy code reaching order placement; the assistant only reads strategies, so it is unaffected.
- Notifications and preferences modules: read through their service classes.

## 4. The UI

- **Entry point:** a **sparkle "Ask" icon button in the header**, in the group with the theme toggle, profile and logout (the notification bell is in the **sidebar**, under the navigation links, not in the header). It is visible only when the AI assistant is on and an account is linked. Alternative: a sidebar entry next to the bell, since both are global actions rather than pages (decision D3). It opens a **right-hand drawer** (a native dialog/sheet like the other shared containers; full-height sheet on phones). Not a floating bubble: a floating assistant was already tried and removed.
  Shortcut `Ctrl+J`.
- **In the drawer:** header (title, "Reads your account. Cannot place orders.", clear conversation, close), a context chip ("You're on Order history"), the message list, **suggested prompts that depend on the page** (Orders: "Show my rejected orders this month"; Portfolio: "Which holding lost the most?"; Strategies: "Why didn't my last strategy run?"), and the input.
- **Answers** are text, then **action buttons** ("Show these orders", "Open this strategy"), and for small result sets an inline mini-table (up to 5 rows, each row linking to the item). Every answer says which tools it used in small text ("Based on your orders") so the customer can see what it looked at.
- **Actions** go through one `AssistantActions` registry in the frontend: action type -> route + query-string builder + validation. Unknown type or invalid parameters render no button.
- **Reuse:** the same `AssistantChat` pieces as plan 05 (message list, input, quick prompts, copy), and a conversation store keyed `account` next to the per-symbol conversations (in memory for the session; cleared on sign-out).
- **Accessibility:** drawer is a dialog with focus trap and Esc, log region (`role="log"`, polite), buttons with names, visible focus, keyboard shortcut announced, reduced motion respected.

## 5. Deep links the destination screens must support

The "take me there, already filtered" promise needs the target pages to read query parameters. This is the main frontend work and it overlaps with other plans:

| Destination | Parameters | State today | Plan |
|---|---|---|---|
| Order history `/orders` | `symbol`, `side`, `status`, `from`, `to`, `order` (highlight one) | Reads only `status`; filters are client-side over the full history | Add symbol and date-range filters to the page (the same shared `date-range` component as plan 07) and read all parameters; `order` scrolls to and highlights a row |
| Notifications `/notifications` | `status`, `category`, `from`, `to` | No parameters | Plan 07 adds the filters; read them from the URL |
| Portfolio tabs `/portfolio/holdings`, `/performance`, `/pnl` | `symbol`, `range`, `from`, `to` | Single page | Plan 13 splits the page; each tab reads its parameters |
| Strategies `/strategies` | `id` | None | Open or highlight that strategy |
| Settings `/settings` | `section` | None | Scroll to the card (`#display`, `#notifications`) |
| New strategy form / order ticket | prefilled fields | Not supported | Add optional `initial` input from query parameters (symbol, side, direction, price, quantity); the customer still presses Create or Place |

## 6. What else comes together with this (a feature set, not just a chat)

1. **Smart search on Order history:** a "Ask in words" box above the filters: *"AAPL sells in September"* becomes filters (one model call, structured output, **no tools and no conversation**), applied to the table. Cheap and very visible.
2. **"Explain this" buttons:** next to a rejected order or a blocked strategy run, a button that asks the assistant "why?" using that item's recorded reason. Turns cryptic statuses into sentences.
3. **Strategy troubleshooting:** "why didn't it run?" from the run trail and the current price versus the trigger.
4. **"What did I miss?"** digest from notifications (pairs with the digest idea in plan 11).
5. **Drafts into the new simple forms:** strategy form (plan 10) and the order ticket pre-filled from a sentence.
6. **Grounded help:** the plain-language documents in `documentation/flows` are used as a small, fixed knowledge base for "what does X mean" questions (no account data needed, no tool call).
7. **Summaries on request:** "summarise my month" using `get_performance` and `get_pnl` (this is idea J of plan 11, delivered through the drawer instead of a separate button).
8. **Export hand-off:** "give me my orders as a spreadsheet" opens the Order history with the same filters and starts the CSV export (plan 11, idea G).

## 7. Cost, quota and limits

- A tool-using answer is **2 to 5 model calls** (each tool round is one). The shared limit is 60 requests a minute across everyone (free tier), so the assistant gets its **own, lower per-account limit** and a cap on rounds, and it **does not take capacity from the signal explanations** (reserve a share, or give the signals a separate counter).
- Token use per question is bounded by the caps above (20 rows x a few fields); metrics follow the signals module's pattern (`assistant.calls`, `assistant.tokens`, `assistant.tool` with the tool name as tag, never customer data).
- If the model is unavailable or over quota the drawer says so in a sentence and offers the **non-AI path** (the filters and pages themselves); nothing else breaks.

## 8. Phases

| Phase | Scope | Exit |
|---|---|---|
| **P1** | `ai` package extraction (no behaviour change), tool-calling in the client, `assistant` module with `list_orders`, `get_order`, `propose_action(OPEN_ORDERS/OPEN_ORDER)`, drawer, Order history deep links (symbol, date range, order) | "When did I place an order for AAPL on 3 October?" answers and opens the filtered list |
| **P2** | Balance, positions, P&L, performance, strategies, notifications tools; destination deep links (portfolio tabs, strategies, notifications, settings) | Every example in section 2 except drafts works |
| **P3** | Smart search box on Order history, "Explain this" buttons, grounded help | |
| **P4** | Drafts into the strategy form and order ticket | A drafted action opens a pre-filled form, creates nothing |

Each phase is shippable and behind `assistant.account.enabled`.

## 9. Tests
- Tool tests: arguments validated and bounded, results capped, **every tool uses only the token's account** (a test that two accounts never see each other's rows), no tool has an account parameter.
- Scripted conversation tests with a fake `TextGenerator` (it replays function calls): tool loop, round cap, unknown tool, invalid arguments, model returning an unsafe action (dropped), empty tool result.
- **Injection tests:** an order symbol or notification text such as "ignore previous instructions and ..." in tool results does not change behaviour or produce an action.
- Architecture test: the assistant package imports no write path.
- Contract test for `assistant-api.yaml`; `AST-403` when the switch is off (nothing reaches the generator), `AST-429`.
- Frontend: action allow-list and builders, drawer accessibility, deep-link specs on each destination page, e2e for the headline example with a stubbed assistant response.

## 10. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Tool calling or send-the-data prompts? | Tool calling |
| D2 | How does the assistant read portfolio data without breaking the independence rule? | A read-only `PortfolioReadFacade` and an explicit, tested exception for the assistant package |
| D3 | Entry point | Header icon button (with theme, profile, logout) opening a drawer, not a floating bubble. Alternative: next to the bell at the bottom of the sidebar |
| D4 | Should it ever execute (place, cancel, create)? | No. Drafts only, always confirmed by the customer on the real form |
| D5 | Per-account question limit | 6 a minute to start, tune with the metrics |
| D6 | Data sent to a hosted model | Review the provider terms for the tier in use before real customer data is sent; minimal fields as designed |
