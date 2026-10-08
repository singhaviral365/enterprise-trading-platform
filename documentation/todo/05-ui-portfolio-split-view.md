# 05 · UI: compact instrument list, quote detail in the middle, assistant chat on the right

Status: **plan, decisions confirmed, not started** (revised after reading the assistant code that is now on this branch).
Applies to **Market data** (where the quote detail and the chatbot live) and **Portfolio** (Holdings/Positions), because both use the
shared `.row-table` and `SplitView`.

## 1. What is on the branch now (analysis)

The "chatbot" is the **Trade signal** card, `features/market/signal-advisor/` (`SignalAdvisor`, selector `app-signal-advisor`),
placed by `QuoteDetail` under the one-year price chart and above the Buy / Sell buttons.

| Part | What it does | Where in `signal-advisor` |
|---|---|---|
| Signal | BUY / SELL / HOLD badge, strength meter (0-100), SMA20, SMA50, RSI(14), latest close, explanation text with a "Written by the AI assistant" / "Standard explanation" label and a Copy button, "As of ... from N trading days", stale warning | `lookup = resource(...)` -> `SignalsApi.signal(accountId, symbol, true)` |
| Chat | Four quick-question buttons, a scrolling log (`role="log"`), a form (Signal Forms, max 500 chars) with Ask button, per-answer source label and Copy. **Only when the customer turned the AI assistant on in Settings** (`PreferencesStore.aiAssistantEnabled`); otherwise a note pointing to Settings and nothing is sent to the model | `messages = linkedSignal(symbol)`, `ask()` -> `SignalsApi.chat({ accountId, symbol, message, conversationHistory })`, last 10 turns sent, no server-side conversation |
| Footer | "How is this worked out?" (`<details>`), disclaimer (always shown) | |

Facts that shape the plan:
- The chat call needs only `accountId`, `symbol`, the message and the history. It does **not** need the signal to have loaded, but today the chat sits **inside**
  the `data()` branch, so an instrument with too little history (`SIG-422`) or a load error shows no chat. That coupling is accidental and goes away with the split.
- Conversation state lives inside the component (`linkedSignal` on `symbol`), so it is lost whenever the component is recreated. Moving the chat to another
  place in the layout would wipe a conversation unless the state is hoisted (section 4.3).
- Only `QuoteDetail` (Market data) uses it. `PositionDetail` (Portfolio) has no advisor.
- It all uses design tokens, no shadows; test ids: `signal-advisor`, `signal-badge`, `signal-strength`, `signal-facts`, `signal-explanation`, `signal-copy`,
  `signal-chat-log`, `signal-question`, `signal-send`, `signal-assistant-off`, `signal-loading`, `signal-no-history`, `signal-error`, `signal-disclaimer`.
  `signal-advisor.spec.ts` covers all of it; no e2e test touches it.
- The detail pane is now tall: price card, chart (260px), signal card with the chat, Buy / Sell. Squeezed into half the page next to a full table, it is cramped.

## 2. Target layout (wide screens)

```
 nothing selected:   [ full table / card grid                                                    ]

 instrument selected:[ compact list ] [ quote detail                 ] [ Assistant chat          ]
                         ~260px          flexible (min ~460px)             ~340px, full height
                      instrument only   price card, chart, signal        quick questions, log,
                      rounded rows      facts + explanation, Buy/Sell    input pinned at bottom
```

1. **List -> compact list.** While a detail is open the list shows **only the Instrument column** (logo, symbol, name) with the row selected. Every other column and
   the table footer are hidden. Price, change and previous close are in the detail's price card, so nothing is lost. Rows keep rounded corners all round (section 4.1).
2. **Detail** keeps price card, chart, **signal card** (badge, strength, facts, explanation, as-of, "how is this worked out", disclaimer) and Buy / Sell.
3. **Chat moves out of the signal card into its own pane on the right**, using the width the compact list freed. It is a tall card: header ("Ask the assistant" plus the
   instrument symbol), quick questions, the log filling the available height, the input fixed at the bottom. It stays visible while the customer switches the detail to
   Buy / Sell, so they can ask questions while placing an order.
4. **Assistant off** (Settings): no chat pane at all, so the detail gets the whole right side. The "Turn on the AI assistant in Settings" note stays in the signal card (as now).
5. **Not enough room** (see 4.4) or a phone: no right pane. The chat renders **inside the detail**, below the signal card, exactly as today. On phones the whole detail is
   still the pop-up.
6. **Cards layout** (Portfolio grid): while a detail is open the cards also become a single column of compact cards (logo, symbol, name).

Width budget at the 1200px page maximum: 260 (list) + 20 + detail + 20 + 340 (chat) -> the detail gets about **560px**, enough for the chart and the facts grid.
That is why the chat pane needs a minimum container width (4.4) instead of simply appearing.

## 3. Component changes

| Component | Change |
|---|---|
| `SignalAdvisor` | **Split in two.** `SignalCard` (`app-signal-card`): signal, facts, explanation, as-of, method, disclaimer, and the "assistant is off" note. `AssistantChat` (`app-assistant-chat`): quick questions, log, form. `SignalAdvisor` is removed. All logic moves unchanged; only the template is divided |
| `AssistantChat` inputs | `symbol` (required), `layout: 'pane' | 'inline'` (pane = tall, log flexes; inline = today's compact card with `max-height: 260px`). Reads `accountId` and `assistantOn` itself, as the advisor does |
| Conversation state | New `ChatSessionStore` (`@Service()` in `core/`): `Map<symbol, ChatMessage[]>` plus `sending`, with `ask(symbol, text)` containing today's `ask()` logic (history of 10, error to "problem" message via `describeError`, the "no second question while one is in flight" rule). Cleared on sign-out. Keeps a conversation when the layout switches between pane and inline, when the detail changes to Buy / Sell and back, and when the customer re-selects the same instrument. Bounded (for example the last 5 instruments, 50 messages each) |
| `QuoteDetail` | Uses `app-signal-card`; shows `app-assistant-chat layout="inline"` only when the right pane is **not** available (input `chatInline`) |
| `SplitView` | Optional third slot `[aside]`; geometry in 4.2; exposes `asideVisible` (signal) so pages can decide where the chat goes |
| Market data page | Projects `<app-assistant-chat layout="pane" [symbol]="selectedSymbol()">` into `[aside]` when the assistant is on; passes `[chatInline]="!split.asideVisible()"` to `QuoteDetail` (via a template reference to the `SplitView`) |
| Portfolio page | No chat today (the position detail has no advisor). The `[aside]` slot is simply unused; adding the signal and chat to `PositionDetail` later needs no layout work |
| Market board list card | In compact mode the "Market" card header (title, LIVE chip, "Updated hh:mm:ss", refresh) and the pagination footer must fit ~260px: hide the "Updated ..." text, keep the LIVE dot and refresh icon, and use the pagination's compact variant (page size select hidden, arrows + "1/2") |

## 4. Implementation notes

### 4.1 Compact mode on the shared table
- `.row-table.is-compact` hides every cell except the first in `thead`, `tbody` and `tfoot`.
- **Corner bug to fix:** with one column the cell is both `:first-child` and `:last-child`; today the `last-child` rule wins and the left corners go square.
  Add `.row-table tbody tr > :first-child:last-child { border-radius: 12px; }`.
- **Selected row legibility** (current complaint): the primary-coloured selected row hides data because secondary colours are tuned for the unselected row.
  Audit `ticker-name`, `.muted`, `--label-subtle`, chips and numeric cells inside `tr.is-selected` and make them follow `--accent-primary-foreground`;
  verify AA contrast in light and dark. Compact mode removes most of the cells that had the problem.
- `MarketBoardPanel`, `PositionsTable` and `PositionsCard` get `compact = input(false)`, set from "a detail is open **and** the split layout is inline" (on narrow screens
  the list stays full because the detail is a dialog). The existing container-query column dropping stays as the fallback for phones.

### 4.2 `SplitView` geometry (three panes, still animated)
- Grid tracks only interpolate between like values (we found out earlier that `fr` to a length does not animate). Use lengths/percentages at both ends:
  - closed: `100% 0 0`
  - open, no aside: `var(--split-list-width) calc(100% - var(--split-list-width) - gap) 0`
  - open, with aside: `var(--split-list-width) calc(100% - list - aside - 2*gap) var(--split-aside-width)`
  with `--split-list-width: 260px`, `--split-aside-width: 340px`, `gap: 20px`. The gap values are folded into the column lengths so the gap itself does not animate.
- The detail panel keeps its **final width during the slide** and is clipped by its column (current behaviour). The aside panel does the same.
- Card layout keeps its own animation (list snaps, panes glide from the right edge).
- The aside is `position: sticky` like the detail, with `height: calc(100vh - header - footer - 32px)` so the chat log can fill it.

### 4.3 Chat state and the aside's life cycle
- The aside content lives outside `QuoteDetail`, so choosing Buy / Sell (which replaces the detail's content with the trade panel) does not touch it.
- `ChatSessionStore` makes the layout switch (pane <-> inline) lossless.
- Esc inside the aside closes the whole split (same as the detail), but typing in the chat box must not trigger the page's keyboard shortcuts.
- Focus: opening the split still focuses the detail pane (not the chat input), so keyboard users land on what they selected.

### 4.4 When is there room for the aside?
Viewport width is the wrong measure (the sidebar and page padding change what is left). Measure the **split container**:
- `SplitView` observes its own width with a `ResizeObserver` (a signal, cleaned up on destroy) and sets `asideVisible = open && hasAside && width >= 1040px`
  (260 + 460 minimum detail + 340 + gaps). Below that the chat is inline in the detail. The threshold is a constant next to `SPLIT_VIEW_QUERY`.
- With the page at the 1200px maximum the aside is visible; with the sidebar open on a 1366px laptop (about 1050px of content) it is borderline, which is why this is
  measured, not guessed. Consider raising the page maximum to 1320px on these two pages if the detail feels tight (decision D4).

## 5. Work breakdown
1. `.row-table.is-compact` + only-child radius + selected-row colour audit; `compact` inputs; Market board header/footer compact variants. Tests: compact shows only the instrument column on both pages; selected row classes; header/footer compact.
2. `SplitView`: new column maths, `[aside]` slot, `ResizeObserver` + `asideVisible`, sticky aside; extend `split-view.spec.ts` (aside shown only when there is content and room; threshold crossing; Esc; focus; cards layout).
3. `ChatSessionStore` (spec): history of 10, in-flight guard, error as problem message, per-symbol conversations, bound, cleared on sign-out.
4. Split `SignalAdvisor` into `SignalCard` and `AssistantChat`; port `signal-advisor.spec.ts` (signal tests -> `signal-card.spec.ts`; chat tests -> `assistant-chat.spec.ts`; **add** the case "chat works for an instrument with no signal / signal error", which used to be impossible). Keep every `data-testid`.
5. `QuoteDetail` and the Market page wiring (`chatInline`, projection into `[aside]`, assistant-off = no pane). Update `quote-detail.spec.ts` (no chat inside when the pane is available; chat inline when not) and `market-board.spec.ts`.
6. Style `AssistantChat layout="pane"` (header, flexible log, pinned input) and `layout="inline"` (today's look), tokens only.
7. Visual check: light and dark; widths 1100 / 1280 / 1366 / 1500 / 1900; sidebar open and closed; assistant on and off; Buy / Sell while chatting; long conversation scrolling; reduced motion.
8. Docs: `DESIGN_SYSTEM.md` ("Selectable tables" compact mode, "Split view" three panes and `asideVisible`, assistant chat component and `ChatSessionStore`).

## 6. Acceptance criteria
- Selecting an instrument leaves a single-column, fully rounded, readable compact list, the detail in the middle and (assistant on, enough room) the chat on the right; closing restores the full table.
- The slide is smooth in table and card layouts; the page width never changes.
- Conversation survives: opening Buy / Sell and coming back, resizing across the threshold, closing and re-selecting the same instrument. A different instrument has its own conversation.
- Assistant off: no chat pane, the Settings note remains, **nothing** is sent to the model (existing test, kept).
- Chat is usable even when the signal cannot be computed.
- Narrow screens and phones behave as today (chat inline in the detail; detail as a pop-up).

## 7. Decisions (all confirmed)
| # | Question | Decision |
|---|---|---|
| D1 | Compact (instrument-only) list on Market data as well as Portfolio? | **Yes.** Price, change and previous close are in the detail's price card |
| D2 | Cards: single compact column while a detail is open? | **Yes** |
| D3 | Chat pane when the assistant is off? | **No pane.** The "turn it on in Settings" note stays in the signal card and the detail keeps the width |
| D4 | Page maximum | **Keep 1200px.** Raise to about 1320px on Market and Portfolio only if the middle pane feels tight after the visual check (step 7) |
| D5 | Conversation lifetime | **In memory for the session only.** No browser storage of AI conversations; cleared on sign-out |

No open questions remain. Implementation follows the work breakdown in section 5, in that order.
