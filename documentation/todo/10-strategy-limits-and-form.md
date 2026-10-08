# 10 · Strategies: do we need limits, and a much simpler "New strategy" form

Status: **plan**. Recommendation first, then the analysis behind it.

## 1. Short answer

1. **Keep the safety limits, stop asking the customer for them.** A strategy that trades while nobody is watching needs a ceiling, but the customer should not
   have to invent one. The two required limits (most one order may cost, largest holding) can be **worked out from the rule itself**, shown as a single
   sentence, and changed only by someone who wants to.
2. **Your assumption is already the default.** One strategy places **one order** unless the customer asks for more: `maxExecutions` defaults to 1.
   "Repeat" becomes an optional extra, not a field everyone sees.
3. **The form shrinks from 10 inputs to 5**, in one row, with a live summary sentence instead of paragraphs of hints. Everything else moves to a collapsed
   "More options".

## 2. What the limits are, and why they exist today

A strategy is an order the platform places **without the customer present**. `STRATEGIES.md` states the rule it is built around:
*"Damage is bounded in code, at the point of decision: a maximum spend, a maximum position, a stop after repeated failures"*, and the contract
(`strategies-api.yaml`, "Limits that bound the damage") adds that the order route checks funds only when an order settles, so these limits, not the route,
are what cap an unattended strategy.

| Limit | Today | What it protects against | Who needs to choose it |
|---|---|---|---|
| `maxOrderValue` | **Required**, typed by the customer, in the account currency | The order costing far more than expected, because the strategy sends a **market** order: it fills at the price at the time, which can be well away from the trigger (a gap, a thin market, a stale price) | Nobody: it can be derived as quantity x trigger price x a safety buffer |
| `maxPositionQty` | **Required**, typed by the customer, in units | A buy growing a holding beyond what the customer intended (including when they buy more by hand after creating the strategy) | Nobody: it can be derived as what they hold now plus quantity x runs |
| `maxExecutions` | Optional, default **1** | A rule repeating more often than intended | Only people who want a repeating rule |
| `maxFailures` | Optional, default **3** | A broken rule hammering the order route forever | Nobody: an internal default |
| `validUntil` (Ends on) | Optional | A forgotten rule firing months later | Only people who want an end date |

Enforced in two places: **order-service** on create (`StrategyService`: amounts must be positive, within the platform ceilings `strategy.limits.*`, and for a
buy the quantity cannot exceed the largest holding) and **executor-service** before every order (`StrategyWorker.limitBreach`: order value at the fresh
quote, in the account currency, against `maxOrderValue`; `held + quantity` against `maxPositionQty`; enough shares to sell). The database columns are `NOT NULL`.

## 3. Is it required "by the story"?

I looked in the repository for the original story or brief and **it is not in it**. What exists are our own documents: `STRATEGIES.md`, `strategies-api.yaml` and
`CONTRACT-CHANGES.md`, which all describe the limits as a **design decision** ("the first two are required: a strategy that trades unattended must have had its damage
bounded by a decision"), not as a quotation of the story. The only story reference is "the brief says orders go through `POST /api/v1/orders`".

So I cannot tell you the story demands limits. **Please check the original text for the words "limit", "maximum" or "damage"** (the task list for the strategy story).
My recommendation holds either way:

| If the story requires limits | If it does not |
|---|---|
| Keep them, exactly as enforced today (create-time and pre-order), so the requirement is met and tested | Still keep **a** cap: removing it makes a bug or a price gap capable of spending far more than the customer expects, and the order route does not check funds at placement |

The point of this plan is that "limit exists" and "limit is a form field" are different things.

## 4. Do limits make it "more seamless, better"?

Honestly: **the protection is valuable, the way it is asked for is not.**

- *Value:* without a cap, "Buy 50 AAPL if it falls to 150" becomes "buy 50 AAPL at whatever the market is when the worker wakes up". If the price gaps down to 120
  the customer gets the order at 120 (cheaper, fine), but if a sell trigger fires on a gap, or the quantity was typed wrong (5000 instead of 50), nothing stops it. The
  cap also protects against our own defects, which the docs rightly call out.
- *Cost:* three required numbers the customer cannot sensibly choose ("largest holding it may build", "stop after this many failures") turn a one-sentence rule into a
  form. Most people will copy the suggested value, so the field adds friction without adding a real decision.
- *Verdict:* **derive sensible limits by default and let the server own them.** The safety stays in code (STRATEGIES.md rule 3 is preserved), and the customer sees one
  sentence they can understand: *"Worst case this spends about $825."*

## 5. Proposed behaviour

### 5.1 Server derives the limits when they are not sent (the single source of truth)

Make `maxOrderValue` and `maxPositionQty` **optional** in the request. If omitted, `StrategyService` fills them in before saving (the columns stay `NOT NULL`, so the
executor and every guard are unchanged):

| Field | Derived value | Notes |
|---|---|---|
| `maxOrderValue` | `quantity x triggerPrice x (1 + buffer)`, converted to the account currency, rounded up to a whole unit, at most the platform ceiling | `buffer` = 15% (setting `strategy.limits.default-buffer-percent`) so ordinary slippage passes and a real gap is stopped. For a SELL the same formula; for the "rises to" direction it is the same |
| `maxPositionQty` | BUY: `current holding + quantity x maxExecutions`. SELL: the current holding (the executor already refuses to sell more than is held) | Counts what is held **now**; the pre-order check compares against the live holding as before |
| `maxFailures` | 3 (unchanged) | Never shown |
| `maxExecutions` | 1 (unchanged) | Shown only under "Repeat" |

If the customer **does** send a value (advanced option, or an API client), it is used and validated exactly as today. The response returns the effective limits, so the UI
and the strategy list can still show them ("Spends at most $825") and the executor is untouched.

Contract change (`contracts/strategies-api.yaml`, `CONTRACT-CHANGES.md`): `maxOrderValue` and `maxPositionQty` move from required to optional, with the derivation
documented; additive, existing clients keep working.

### 5.2 The new form

Everything the customer must decide fits on one line; the rest explains itself in one sentence.

```
 New strategy
 +------------------------------------------------------------------------------------------+
 | Instrument        Do this         When the price           Price          Quantity       |
 | [AAPL v]  Now 331 [Buy | Sell]    [Falls to or below v]    [ $ 150.00 ]   [   5   ]       |
 +------------------------------------------------------------------------------------------+
   Buy 5 AAPL when the price falls to $150.00. Runs once. Worst case about $862 (the order
   is placed at the market price, so it can differ).                         <- one live sentence
   > More options                                                             <- collapsed
        Repeat up to [ 1 ] times   Ends on [ date ]   Spending cap [ auto: $862 ]  Largest holding [ auto ]
                                                                    [ Cancel ]  [ Create strategy ]
```

- **Five inputs** in a single row on wide screens (wrapping to two columns and then one on narrow ones): Instrument, Buy/Sell, When the price, Price, Quantity. No
  section titles ("1. The rule", "2. Your limits"), no fieldset borders.
- **The summary sentence is the explanation.** It updates as the customer types and replaces the three hint paragraphs, the "cost at trigger" note and the
  "These are checked before every order..." text. It always contains: the rule in words, how many runs, and the worst-case spend (from the derived cap).
- **Hints only when needed:** a hint appears under a field only in an error state ("Enter a price above 0"), never as permanent grey text. The "price is already past that
  level" message keeps its place, in one short line: "AAPL is already below $150, so this would trade now. Pick a lower price."
- **"More options"** (a native `<details>`, closed by default) holds: *Repeat up to N times*, *Ends on*, and the two limits as **pre-filled "auto" values** that can be
  overwritten ("Spending cap", "Largest holding"). Labels are plain words, no "may build" or "stop after failures in a row".
- Submit is enabled as soon as the five inputs are valid (the screenshot shows a disabled button because the limits were empty and required).
- Remove the "Use the quantity" and "Use 825" helper buttons: the auto values make them unnecessary.

### 5.3 Text diet (the whole Strategies area)
- Form: from about 130 words of helper copy to one summary sentence plus error messages.
- The header paragraph ("Say when to trade ... never goes outside the limits you set below") becomes one line: "The platform places this order for you when the price reaches your level, even when you are signed out." The "where it goes" detail stays in `STRATEGIES.md` and, on request, a "How does this work?" `<details>`.
- Strategy list cards show the rule as a sentence ("Buy 5 AAPL if price falls to $150") and status; limits move to the detail/activity view.
- `strategy-activity` run outcomes keep their short labels.

## 6. Work breakdown
1. **Contract and backend (order-service):** optional limits in `CreateStrategyRequest` (nullable instead of `@NotNull`), derivation in `StrategyService` (new
   `StrategyLimitDefaults` helper: buffer, ceiling, currency conversion with the existing `CurrencyConversionService`), setting `strategy.limits.default-buffer-percent`;
   keep every existing validation for supplied values. Tests: derived values for BUY/SELL/BELOW/ABOVE, multi-currency, quantity over the ceiling, supplied values override, buy
   quantity above the derived position (cannot happen) and unchanged behaviour for explicit limits.
2. **Executor:** no change (it reads the saved limits), but add one test that a strategy created with derived limits trades and one that breaches the derived cap is blocked.
3. **Regenerate the client** (`npm run api:generate`) and record the change in `CONTRACT-CHANGES.md` and `STRATEGIES.md` ("Limits" section: defaults and why).
4. **Frontend:** rewrite `strategy-form.{html,ts,css}` (five inputs in one row, live summary, `<details>` for More options, error-only hints), keep the existing signal-form validation for
   what remains; use shared components (`app-dropdown`, `app-side-toggle`), tokens only.
5. **Tests:** update `strategy-form.spec.ts` (submits with only the five inputs, shows the summary sentence, More options overrides, error hints, the "already reached" message) and
   `strategies.spec.ts` as needed; add an e2e step if one creates a strategy.
6. **Docs:** `STRATEGIES.md` (controls table: "Maximum spend / position: defaulted from the rule, overridable"), `DESIGN_SYSTEM.md` if the summary-line pattern is reusable (order ticket could use it).

## 7. Acceptance criteria
- A customer can create a strategy by filling five fields and pressing Create, with no limit typed.
- The saved strategy has a spending cap and a position cap, visible in its detail, and the executor blocks an order that exceeds them (existing tests plus the new ones pass).
- Existing API clients that send explicit limits behave exactly as before.
- The form has no permanent helper paragraphs; the live sentence states the rule, the number of runs and the worst-case spend.
- Keyboard and screen-reader use: the summary is an `aria-live="polite"` region, labels are visible, errors are tied to inputs (`aria-describedby`).

## 8. Decisions needed
| # | Question | Recommendation |
|---|---|---|
| D1 | Check the story for the word "limit" (section 3) | Needed before we delete anything; nothing in this plan removes a limit |
| D2 | Default buffer | 15%; a stricter 10% blocks more gap-fills, a looser 25% allows more |
| D3 | Keep "Repeat" in the first version? | Yes, in More options; it is already supported and is the only way to use a strategy more than once |
| D4 | Hide the limits entirely, or show them as editable "auto" values in More options? | Show them (transparency about what the platform will enforce), editable |
