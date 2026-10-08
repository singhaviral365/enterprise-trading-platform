# 06 · UI: Settings in two columns, compact cards

Status: **plan**. Layout and spacing only; no behaviour or API changes.

## 1. Today
`features/settings` is one narrow centred column (`:host { max-width: 880px }`) with four stacked cards:
**Sign-in security**, **Notifications**, **Display**, **Appearance and behaviour**. The sides of a wide screen stay empty, and the page
scrolls a long way. (Two-step sign-in applies immediately; the other three share one form with a Save button.)

## 2. Target

```
+--------------------------------+   +--------------------------------+
| Sign-in security               |   | Notifications                  |
| Two-step sign-in     [toggle]  |   | Order updates   [x] in-app [x] email |
| ...                            |   | ...                            |
+--------------------------------+   +--------------------------------+
+--------------------------------+   +--------------------------------+
| Display                        |   | Appearance and behaviour       |
| Currency [ USD v ]             |   | Theme  [ Light | Dark | System ] |
| Date format [ v ]              |   | ...                            |
+--------------------------------+   +--------------------------------+
                                  [ Save changes ]
```

- Page width: use the same readable maximum as the other wide pages (**1200px**, like Market data and Portfolio) instead of 880px.
- Grid: `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start`, from **900px** up;
  one column below. Cards in a row share a height only if it looks balanced; default `align-items: start` so a short card does not stretch into emptiness.
- Order: row 1 security + notifications, row 2 display + appearance (keeps related things together and the two heaviest cards apart).
- The status/alert cards (loading, error, no account) span both columns (`grid-column: 1 / -1`).
- The **Save** bar stays a single full-width row under the grid, aligned right, with the existing "unsaved / saved" feedback.

## 3. Compact but clean card content
- Card padding `20px` -> `16px 18px`; title margin-bottom `16px` -> `10px`; spacing between form groups `16px` -> `12px`.
- Settings that are a label plus one control become a **row**: label (and hint beneath it, `--surface-foreground-subtle`, 12px) on the left,
  the control on the right (`display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px`). Toggles and dropdowns line up in one
  right-hand column, which is what makes dense cards still look tidy.
- Hints stay one or two lines; move long explanations (for example the currency-conversion warning) into the existing alert style under the row.
- Dividers between rows: `1px solid var(--surface-line-subtle)`, no extra spacing doubling.
- Tokens and global classes only (`.card`, `.form-*`, existing toggle/dropdown components); no new colours, no shadows.
- Container-aware: the row layout switches back to stacked (label above control) when the card is narrower than ~360px (`@container`), so 900-1000px windows with two columns still fit.

## 4. Work breakdown
1. `settings.css`: wider host, grid wrapper, compact paddings, row layout classes (`.setting-row`), full-width state cards.
2. `settings.html`: wrap the four cards in the grid; convert groups to `.setting-row`; keep every `data-testid`, `id`, label `for` and aria relationship as is.
3. Check focus order follows visual order (row 1 left to right, then row 2). Use DOM order, not CSS `order`.
4. Tests: `settings.spec.ts` should need no change; add one assertion that the four sections render inside the grid container.
5. Visual check: 320, 600, 900, 1200, 1900px; light and dark; error and loading states.
6. `DESIGN_SYSTEM.md`: add the "setting row" pattern under Forms.

## 5. Acceptance criteria
- On wide screens two cards per row, no horizontal scrolling, nothing clipped; one column on small screens.
- Visibly tighter than today without feeling crowded (consistent 12px rhythm, aligned controls).
- All existing behaviour and test ids unchanged; AXE clean (labels, hints via `aria-describedby`).
