# 08 · UI: replace the long "minus / dash" marks with a small hyphen

Status: **plan**. Cosmetic, frontend only. Safe to do in one small change.

## 1. The problem

Where a number is zero, unchanged or missing, the app shows either the Font Awesome `fa-minus` icon or a literal em dash (`—`).
Both are long, heavy bars that read like a punctuation mark in the middle of a table. You want something smaller and more subtle: a plain hyphen.

## 2. Inventory (from a search of `frontend/src`, generated clients excluded)

### 2.1 `fa-minus` as the "no change" indicator (replace)
| File | Where it shows |
|---|---|
| `features/market/market-board/market-board.html:130` | "% Change" chip of a row whose change is exactly 0 |
| `features/dashboard/watchlist/watchlist.html:169` | Direction icon on a watchlist row with no move |
| `features/portfolio/portfolio-performance/portfolio-performance.html:59` | Return chip when the range return is 0 |
| `shared/ui/pnl-value/pnl-value.ts:23` | Profit and loss value that is exactly 0 (used all over Portfolio) |

### 2.2 Literal `—` as the "no data" placeholder (replace)
| File | Where it shows |
|---|---|
| `features/market/market-board/market-board.html:116,123,142` | No quote / no change / no change % |
| `features/portfolio/positions-table/positions-table.html:49` | A holding with no price yet |
| `features/strategies/strategy-activity/strategy-activity.html:46,58` | Run with no order or no price |
| `shared/ui/order-ticket/order-ticket.html:113,123` | Estimate unavailable |
| `shared/ui/pnl-value/pnl-value.ts:14` | P&L unavailable |

### 2.3 Leave alone (these are real minus signs, not dashes)
| Where | Why |
|---|---|
| `order-ticket.html:55`, `fa-minus` on the **Decrease quantity** stepper | It is the "-" half of a +/- stepper; the glyph is correct. It could still use the same small weight if it looks heavy next to the plus (check visually) |
| `fa-circle-minus` on the **Sell** side (side toggle, quote detail Sell button, position detail Sell button) | A circled minus is the Sell/"take out" icon, paired with `fa-circle-plus` for Buy. It does not read as a dash. See decision D1 |
| Negative numbers such as `-1.25` | Come from the number pipes |

Also check once more with a search for `–` (en dash), `&mdash;`, `&ndash;` and CSS `content: '\2014'`; none were found outside the files above.

## 3. Design

One shared, subtle glyph so the app is consistent and a future change is one edit.

- **Missing data** -> a plain ASCII hyphen `-` in the muted colour, normal weight, the same size as the surrounding text:
  `<span class="no-value" aria-hidden="true">-</span>` plus a visually hidden word for screen readers (see section 5).
- **Zero / unchanged** (the chips and P&L): a hyphen in the same chip, medium weight, slightly smaller than the digits it replaces
  (`font-size: 0.9em`), instead of an icon, so it reads as "flat" without a long bar. The chip keeps its neutral background.
- Global classes in `styles.css` (tokens only): `.no-value { color: var(--surface-foreground-subtle); font-weight: 400; }` and
  `.zero-mark { font-weight: 600; font-size: 0.9em; }`. Document both in `DESIGN_SYSTEM.md` under "Status text".
- Nothing else changes: colours, spacing and table alignment stay.

## 4. Work breakdown
1. Add the two classes to `styles.css` and a short entry in `DESIGN_SYSTEM.md`.
2. Section 2.1: swap each `fa-minus` `<i>` for `<span class="zero-mark" aria-hidden="true">-</span>` (keeping the `fa-arrow-trend-*` and `fa-caret-*` icons for up and down). In `pnl-value.ts` and the three templates, the `[class.fa-minus]` bindings go away.
3. Section 2.2: replace `—` with `<span class="no-value" aria-hidden="true">-</span>` and give each a screen-reader text (`<span class="visually-hidden">No value</span>`, or the more specific "No quote", "No price") where the cell would otherwise be empty to assistive tech. Several already have `aria-hidden="true"` on the dash with nothing else; those cells need the hidden text.
4. Update specs that assert the dash or the icon: `pnl-value.spec.ts`, `market-board.spec.ts`, `positions-table.spec.ts`, `portfolio-performance` spec, `watchlist.spec.ts`, order-ticket spec (search for `'—'` and `fa-minus` in `*.spec.ts`).
5. Visual check in light and dark: market table (zero change row), Portfolio tiles with zero P&L, a holding with no price, order ticket with no estimate.

## 5. Accessibility
- The dash must never be the only content for a screen reader: a cell that shows "-" for "no data" needs a text alternative ("No value", "Price unavailable").
- A "flat" chip keeps its text alternative (for example "unchanged") so colour and icon are not the only signal (WCAG AA).

## 6. Acceptance criteria
- No `—` and no `fa-minus` remain in templates except the quantity stepper; the placeholders are a small hyphen in the muted colour.
- Zero-change chips show a small hyphen, not a long bar; layout does not shift.
- Specs updated and green; AXE-style checks (text alternatives) still pass.

## 7. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Also change the circled minus on **Sell**? | No. It is the Sell icon, not a dash. If it still bothers you, use `fa-arrow-trend-down` or `fa-arrow-down` for Sell (and `fa-arrow-up` for Buy) as a separate small change |
| D2 | Hyphen `-` or en dash `–` for "no data"? | Plain hyphen, as you asked (smaller and quieter) |
