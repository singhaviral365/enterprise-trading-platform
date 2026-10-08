# 07 · UI: Notifications page, wider, with status and date filters

Status: **plan**. Needs a small **backend and contract change** (section 3), so it is not frontend-only.

## 1. Today
- `features/notifications` is a centred column (`max-width: 900px`) with a search box, a **Category** multi-select and the list (newest first, paginated).
- The list shows **unread** notifications plus ones **read within the last hour** (dimmed), because the server applies a one-hour retention rule
  (`READ_RETENTION_MS` in `core/notification-inbox.store.ts`; the server uses the same rule).
- `GET /api/v1/accounts/{accountId}/notifications` supports only `q`, `category`, `page`, `size`. There is **no** read/unread filter
  and **no** date filter. The response has `unreadCount`.
- The bell (in the sidebar, under the navigation links) shares the same `NotificationInboxStore` (query, categories, page) as the page.

## 2. Target

Filter bar (one row, wraps on small screens):

`[ Search ] [ Category v ] [ Status v: Unread ] [ From - To  v ] [ reset icon ]`

| Control | Behaviour |
|---|---|
| Search | As today (debounced) |
| Category | As today |
| **Status** (new) | Multi-select dropdown with **Unread** and **Read**. **Default: only Unread selected.** Both selected = everything. Neither is not allowed (re-selects Unread) |
| **Date range** (new) | From and To dates with presets: Today, Last 7 days, Last 30 days, Custom. Empty = no date limit. Applies to the notification's created time |
| **Reset filters** (new) | Icon-only tertiary button (`fa-rotate-left`, tooltip and `aria-label` "Reset filters"), the same pattern as Order history. Restores the **defaults**: no search, no categories, status = Unread, no dates. Disabled when nothing differs from the defaults |

"Filtering" (used for the empty-state wording) means: anything differs from the defaults.
Empty states: default filters + nothing -> "You have no unread notifications."; otherwise "No notifications match."

### Wider, but still good looking
The page grows from 900px to the common wide maximum (**1200px**) and the list uses the extra width instead of stretching a short row:
- Each row becomes a grid: `icon | title + message (flexible, 2-line clamp) | category chip | time | read/unread dot`, so the columns line up down the page.
- Unread rows keep the existing emphasis (bold title, indicator); read rows are dimmed. Selected/hover use the shared row-card look (rounded, subtle lift) so
  it matches Market data and Portfolio.
- Below 700px the grid stacks (chip and time move under the message).
- Tokens only; no shadows.

## 3. Backend and contract changes (needed for Status and Date)

| Area | Change |
|---|---|
| `contracts/notifications-api.yaml` (`listNotifications`) | Add query params: `status` (repeatable, `UNREAD` / `READ`; default `UNREAD`), `from` and `to` (ISO date-time, inclusive; optional). Note in the description that the one-hour read-retention rule **no longer limits** results when `READ` is requested explicitly |
| `contracts/CONTRACT-CHANGES.md` | Record the change (new params, changed default, retention) |
| order-service | Notification list query (repository/specification): filter by read state, `createdAt` between `from`/`to`; apply retention only to the legacy call without `status`. Validation: `from <= to`, max range (suggest 366 days), status values. Tests for each filter and combinations |
| `unreadCount` in the response | Must stay the **total** unread count for the account, not the count of the filtered page (verify in the order-service implementation). The bell depends on it |
| Frontend client | `npm run api:generate` after the contract change |

Compatibility: a request without `status` keeps today's behaviour (unread + read within the hour) so any other consumer is unaffected;
only the new page sends `status` explicitly.

## 4. Frontend work

1. **Store** (`core/notification-inbox.store.ts`): add `statuses` (default `['UNREAD']`), `from`, `to` signals; pass them to the API; page back to 1 when
   any filter changes. Add a `resetFilters()` and a `isDefaultFilters` computed.
2. **Bell must not change**: the bell reads only the unread **count** and a short list. Give it its own cheap request or a dedicated read-only part of the
   store, so the page's filters (for example "Read only", or a date range) never change the badge. Add a spec for exactly this.
3. **Keep a just-opened item visible**: with "Unread" only, opening a notification would make it vanish under the cursor (today the one-hour rule prevents that).
   Keep opened items in the list, dimmed, until the next filter change or refresh, then drop them.
4. **Shared date-range control**: new `shared/ui/date-range` (two native `<input type="date">`, preset buttons, `model()` for `{from, to}`, min/max
   validation, labels, error text), built from design-system classes. It will also suit Order history later. Spec + showcase entry.
5. **Page** (`notifications.{html,ts,css}`): filter bar, Status multi-dropdown (reuse `app-multi-dropdown`), date range, reset button with tooltip, wider layout and the
   row grid. Debounce search as today.
6. **Settings/preferences**: none.
7. Tests: store (defaults, statuses, dates, reset, paging reset), page (default shows Unread only, Read toggle, date presets, reset enables/disables),
   bell independence, `date-range` component. e2e: update any test that expects recently read notifications to show by default.
8. Docs: `DESIGN_SYSTEM.md` (date-range component), `NOTIFICATIONS.md` (new params and behaviour).

## 5. Order of work
1. Contract + order-service filters and tests, regenerate the client.
2. Store changes and the bell fix.
3. `date-range` component.
4. Page layout and filters.
5. Tests, docs, visual check (light/dark, 1200/1900/600px).

## 6. Acceptance criteria
- Opening the page shows only unread notifications; selecting "Read" as well shows read ones regardless of age.
- Date range limits results; invalid ranges are prevented or explained.
- Reset returns to Unread-only, no search/category/dates in one click, and is disabled when already at defaults.
- The bell badge is unaffected by any page filter.
- Wider layout aligns columns and still looks tidy on narrow screens; AXE clean.

## 7. Open questions
1. Maximum date range and whether the date filter should also offer time of day (recommendation: dates only, whole days in the user's time zone).
2. Should "Mark all as read" be added now that read/unread is filterable? (Not requested; cheap to add later.)
