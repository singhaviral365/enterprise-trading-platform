# Design System

The single reference for how the trading UI looks and how to build with it. Read this before adding
or changing any screen. It is written for developers and for coding agents.

Everything lives in `frontend/src`:

| What | Where |
|---|---|
| Tokens, global classes (buttons, forms, cards, tables, modal) | `styles.css` |
| Reusable components | `app/shared/ui/*` |
| App shell (header, sidebar, footer) | `app/layout/*` |
| UI services (theme, notifications, confirm dialog) | `app/core/*.service.ts` |
| Live examples of every component | `/showcase` route (`app/showcase`) |

## Table of contents

- [1. Rules](#1-rules)
- [2. Foundations](#2-foundations)
  - [2.1 Colour tokens](#21-colour-tokens)
  - [Surfaces](#surfaces)
  - [Accent](#accent)
  - [Status: success](#status-success)
  - [Status: info](#status-info)
  - [Status: warning](#status-warning)
  - [Status: error](#status-error)
  - [Shell](#shell)
  - [Data (charts)](#data-charts)
  - [2.2 Gradients, shadows and shell tokens](#22-gradients-shadows-and-shell-tokens)
  - [2.3 Typography](#23-typography)
  - [2.4 Spacing, layout and radii](#24-spacing-layout-and-radii)
  - [2.5 Motion](#25-motion)
  - [2.6 Theming](#26-theming)
- [3. Global CSS patterns (`styles.css`)](#3-global-css-patterns-stylescss)
  - [Buttons](#buttons)
  - [Forms](#forms)
  - [Cards](#cards)
  - [Tables](#tables)
  - [Selectable tables (`.row-table`)](#selectable-tables-row-table)
  - [Status text](#status-text)
  - [Empty state and toolbar](#empty-state-and-toolbar)
  - [Modal building blocks](#modal-building-blocks)
  - [Accessibility helpers](#accessibility-helpers)
- [4. Components](#4-components)
  - [4.1 Header, sidebar, footer (`layout/`)](#41-header-sidebar-footer-layout)
  - [4.2 Dropdown (`shared/ui/dropdown/dropdown`)](#42-dropdown-shareduidropdowndropdown)
  - [4.3 Multiselect (`shared/ui/multiselect/multiselect`)](#43-multiselect-shareduimultiselectmultiselect)
  - [4.3b Multi-select dropdown (`shared/ui/multi-dropdown/multi-dropdown`)](#43b-multi-select-dropdown-shareduimulti-dropdownmulti-dropdown)
  - [4.4 Pagination (`shared/ui/pagination/pagination`)](#44-pagination-shareduipaginationpagination)
  - [4.5 Spinner (`shared/ui/spinner/spinner`)](#45-spinner-shareduispinnerspinner)
  - [4.6 Tooltip (`shared/ui/tooltip/tooltip`)](#46-tooltip-shareduitooltiptooltip)
  - [4.7 Dialog (`shared/ui/dialog/dialog` + `core/dialog.service`)](#47-dialog-shareduidialogdialog--coredialogservice)
  - [4.7b Auth dialog (`features/auth/auth-dialog` + `core/auth-dialog.service`)](#47b-auth-dialog-featuresauthauth-dialog--coreauth-dialogservice)
  - [4.8 Notification (`shared/ui/notification/notification` + `core/notification.service`)](#48-notification-shareduinotificationnotification--corenotificationservice)
  - [4.9 Side toggle (`shared/ui/side-toggle`)](#49-side-toggle-shareduiside-toggle)
  - [4.10b Order status badge (`shared/ui/order-status/order-status`)](#410b-order-status-badge-shareduiorder-statusorder-status)
  - [4.10c Order history page (`features/orders`)](#410c-order-history-page-featuresorders)
  - [4.10d Holdings on the Portfolio page](#410d-holdings-on-the-portfolio-page)
  - [4.10e Market data page (`features/market`)](#410e-market-data-page-featuresmarket)
  - [4.10f Dashboard (`features/dashboard`)](#410f-dashboard-featuresdashboard)
  - [4.11 Instrument icon and label (`shared/ui/instrument-icon`, `shared/ui/instrument-label`)](#411-instrument-icon-and-label-shareduiinstrument-icon-shareduiinstrument-label)
  - [4.12 Sheet dialog (`shared/ui/sheet-dialog`)](#412-sheet-dialog-shareduisheet-dialog)
  - [4.13 Donut chart (`shared/ui/donut-chart`)](#413-donut-chart-shareduidonut-chart)
  - [4.13b Line chart (`shared/ui/line-chart`)](#413b-line-chart-shareduiline-chart)
  - [4.14 Order ticket, confirmation and side toggle (`shared/ui/order-ticket`, `order-confirmation`, `side-toggle`)](#414-order-ticket-confirmation-and-side-toggle-shareduiorder-ticket-order-confirmation-side-toggle)
  - [4.15 Split view (`shared/ui/split-view`)](#415-split-view-shareduisplit-view)
  - [4.16 Quote summary and trade panel (`shared/ui/quote-summary`, `shared/ui/trade-panel`)](#416-quote-summary-and-trade-panel-shareduiquote-summary-shareduitrade-panel)
  - [4.17 Settings, preferences and the formatting pipes (`features/settings`, `core/preferences*`, `shared/formatting`)](#417-settings-preferences-and-the-formatting-pipes)
  - [4.18 Notification bell and page (`layout/notifications`, `features/notifications`)](#418-notification-bell-and-page-layoutnotifications-featuresnotifications)
  - [4.19 Watchlist panel: add dropdown and price alerts](#419-watchlist-panel-add-dropdown-and-price-alerts)
  - [4.20 Portfolio page (`features/portfolio`)](#420-portfolio-page-featuresportfolio)
  - [4.10 `NoClipboard` directive (`shared/directives/no-clipboard`)](#410-noclipboard-directive-shareddirectivesno-clipboard)
- [5. Services the UI relies on](#5-services-the-ui-relies-on)
- [6. Recipes](#6-recipes)
- [7. Contributing checklist](#7-contributing-checklist)
- [8. Known limits](#8-known-limits)

## 1. Rules

1. **Colours come from tokens only.** Never write a hex value, `rgb()`, `rgba()`, `hsl()` or a colour
   keyword (`white`, `red`, ...) in a component stylesheet or template. Use `var(--token)`. The only
   file that defines colour values is `styles.css`. Need a new colour? Add a token to **both** the
   light (`:root`) and dark (`:root[data-theme="dark"]`) blocks.
2. **Overlays and dimming** are done with a token plus `opacity` (see `.modal-overlay::before`), not
   with a translucent colour.
3. **Cards** are `class="card"`: `1px solid var(--surface-line-subtle)`, `var(--radius-card)`. Do not restyle the
   border. **No `box-shadow` in new UI** (cards, tiles, buttons, dialogs, charts): separate things with borders,
   background tokens and spacing. The `--card-shadow*` / `--accent-glow` tokens remain only for older screens that
   have not been revisited.
4. **Use the global classes and shared components before writing new CSS.** If you find yourself
   copying a style into a second component, promote it to `styles.css` or `shared/ui`.
5. **Accessibility is WCAG AA.** Every control has an accessible name, focus is visible (global
   `:focus-visible` ring uses `--surface-foreground-link`), icons are `aria-hidden="true"`, colour is
   never the only signal (pair it with text or an icon), and motion respects `prefers-reduced-motion`.
6. **Angular conventions:** standalone components (do not write `standalone: true`), signals with
   `input()` / `output()` / `model()`, `computed`, `host: {}` instead of `@HostBinding` /
   `@HostListener`, `@if` / `@for` instead of `*ngIf` / `*ngFor`, no `ngClass` / `ngStyle` (use
   `[class.x]` / `[style.x]`), `inject()` for DI, `@Service()` for singleton services, strict
   templates (`strictTemplates` is on). Prefer Signal Forms.
7. **Both themes must work.** Check every screen in light and dark before merging.

## 2. Foundations

### 2.1 Colour tokens

Values are generated from `styles.css`; if they drift, `styles.css` wins.

### Surfaces

| Token | Light | Dark |
|---|---|---|
| `--surface-background` | `#F4F6FA` | `#0A0D12` |
| `--surface-background-bright` | `#FFFFFF` | `#12161D` |
| `--surface-container-background` | `#EEF1F6` | `#181D26` |
| `--surface-container-background-low` | `#F8FAFC` | `#12161D` |
| `--surface-container-background-medium` | `#FFFFFF` | `#181D26` |
| `--surface-container-background-high` | `#FFFFFF` | `#1F2530` |
| `--surface-foreground` | `#0F172A` | `#E8EAF0` |
| `--surface-foreground-subtle` | `#5B6475` | `#9BA3B4` |
| `--surface-line` | `#8A93A3` | `#4A5364` |
| `--surface-line-subtle` | `#E4E8EF` | `#252C38` |
| `--surface-foreground-link` | `#047857` | `#6EE7B7` |
| `--surface-foreground-link-interaction` | `#065F46` | `#A7F3D0` |

### Accent

| Token | Light | Dark |
|---|---|---|
| `--accent-primary-background` | `#047857` | `#34D399` |
| `--accent-primary-background-interaction` | `#065F46` | `#6EE7B7` |
| `--accent-primary-foreground` | `#FFFFFF` | `#03241A` |
| `--accent-primary-container-background` | `#ECFDF5` | `#0F2A22` |
| `--accent-primary-container-foreground` | `#5B6475` | `#9BA3B4` |

### Status: success

| Token | Light | Dark |
|---|---|---|
| `--status-success-background` | `#047857` | `#34D399` |
| `--status-success-foreground` | `#FFFFFF` | `#03241A` |
| `--status-success-container-bg` | `#ECFDF5` | `#0F2A22` |
| `--status-success-container-fg` | `#047857` | `#6EE7B7` |
| `--status-success-container-line` | `#A7F3D0` | `#1F5E48` |

### Status: info

| Token | Light | Dark |
|---|---|---|
| `--status-info-background` | `#2563EB` | `#60A5FA` |
| `--status-info-foreground` | `#FFFFFF` | `#0A1A33` |
| `--status-info-container-bg` | `#EFF6FF` | `#0F1E36` |
| `--status-info-container-fg` | `#1D4ED8` | `#93C5FD` |
| `--status-info-container-line` | `#BFDBFE` | `#2B4C7E` |

### Status: warning

| Token | Light | Dark |
|---|---|---|
| `--status-warning-background` | `#B45309` | `#FBBF24` |
| `--status-warning-foreground` | `#FFFFFF` | `#2A1A02` |
| `--status-warning-container-bg` | `#FFFBEB` | `#2B2111` |
| `--status-warning-container-fg` | `#92400E` | `#FCD34D` |
| `--status-warning-container-line` | `#FDE68A` | `#6B5220` |

### Status: error

| Token | Light | Dark |
|---|---|---|
| `--status-error-background` | `#DC2626` | `#F87171` |
| `--status-error-foreground` | `#FFFFFF` | `#2A0707` |
| `--status-error-container-bg` | `#FEF2F2` | `#2E1416` |
| `--status-error-container-fg` | `#B91C1C` | `#FCA5A5` |
| `--status-error-container-line` | `#FECACA` | `#7A2A2E` |

### Shell

| Token | Light | Dark |
|---|---|---|
| `--shell-background` | `rgb(255 255 255 / 0.78)` | `rgb(10 13 18 / 0.72)` |
| `--shell-foreground` | `#0F172A` | `#E8EAF0` |
| `--shell-border` | `#E4E8EF` | `#252C38` |
| `--shell-hover` | `rgb(15 23 42 / 0.06)` | `rgb(255 255 255 / 0.07)` |
| `--shell-cta-background` | `#047857` | `#34D399` |
| `--shell-cta-foreground` | `#FFFFFF` | `#03241A` |
| `--shell-cta-hover` | `#065F46` | `#6EE7B7` |

### Data (charts)

| Token | Light | Dark |
|---|---|---|
| `--data-categorical-1` | `#8CC1FD` | `#2751C2` |
| `--data-categorical-2` | `#8AD97C` | `#1E6F1D` |
| `--data-categorical-3` | `#D4B3FB` | `#7332BA` |
| `--data-categorical-4` | `#E2D698` | `#997E05` |
| `--data-categorical-5` | `#FE98F5` | `#C318A0` |
| `--data-categorical-6` | `#A3E2FF` | `#047CBB` |
| `--data-categorical-7` | `#FFC371` | `#C74B07` |
| `--data-categorical-8` | `#51F7D5` | `#058070` |
| `--data-categorical-9` | `#ABAAA8` | `#757473` |
| `--data-categorical-10` | `#FF9F9F` | `#C31212` |


Also available: `--data-mono-{green,blue,red,neutral}-1..5` (sequential chart ramps).

**Which token for what**

| Need | Use |
|---|---|
| Page background | `--surface-background` |
| Card / panel / input background | `--surface-background-bright` |
| Table header, hover rows, chips | `--surface-container-background` |
| Body text | `--surface-foreground` |
| Secondary text, hints, captions | `--surface-foreground-subtle` |
| Borders (default) | `--surface-line-subtle` |
| Borders that must be visible (secondary buttons) | `--surface-line` |
| Links | `--surface-foreground-link` (hover `-interaction`) |
| Primary action | `--accent-primary-background` / `--accent-gradient` |
| Success / info / warning / error **fills** (buttons, toasts) | `--status-<kind>-background` + `-foreground` |
| Success / info / warning / error **text and tinted panels** | `--status-<kind>-container-fg` / `-container-bg` / `-container-line` |

Contrast: status `container-fg` on `container-bg`, and `*-foreground` on `*-background`, are chosen
to meet 4.5:1 in both themes. Do not mix a `-background` fill with a `-container-fg` text.

### 2.2 Gradients, shadows and shell tokens

| Token | Purpose |
|---|---|
| `--accent-gradient`, `--accent-glow` | Primary button fill and its glow |
| `--hero-gradient`, `--hero-foreground` | Hero banners (white text stays above 4.5:1) |
| `--page-glow` | Soft radial glow behind the page (on `html, body`) |
| `--card-shadow`, `--card-shadow-hover` | Card elevation |
| `--shell-background`, `--shell-foreground`, `--shell-border`, `--shell-hover` | Frosted header / footer |
| `--shell-cta-background/-foreground/-hover` | "Login / Register" call to action in the header |

### 2.3 Typography

Font: **Fidelity Sans** (loaded via `@font-face` in `styles.css`), falling back to `sans-serif`.

| Class | Use |
|---|---|
| `.page-title` | One per page, the `<h1>` (24px / 700) |
| `.page-subtitle` | Line under the title (18px) |
| `.section-heading` | `<h2>` for a section (18px / 600) |
| `.card-title` | Heading inside a card (16px / 600) |
| `.text-small`, `.text-center` | Small text, centred text |
| `.form-hint` | 12px helper text under a field |

Keep heading levels in order (h1 → h2 → h3).

### 2.4 Spacing, layout and radii

- Spacing utilities: `.gap-8/12/16/24`, `.mt-4/8/16/24/32`, `.mb-4/8/16/24/32`.
- Layout utilities: `.flex`, `.flex-col`, `.flex-1/2/3`, `.items-center`, `.justify-center`,
  `.justify-between`, `.wrap`, `.full-width`.
- Pages are wrapped in `<div class="main-page">` inside `.app-main` (padding 32px / 40px).
- Radii: cards `var(--radius-card)` (18px), buttons 12px (small 8px), inputs 10px, tables 12px.
- Layout variables: `--header-height`, `--footer-height`, `--sidebar-width-open`,
  `--sidebar-width-closed`.
- Stacking: `--sidebar-z` (100) < `--header-z` / `--footer-z` (200) < `--modal-z` (9998) <
  `--notification-z` (9999). Never invent a z-index; use these.

### 2.5 Motion

- `.rise-in` fades a card in; stagger siblings with `style="--stagger: 1"` (70ms per step).
- `.card.is-lift` lifts a card on hover.
- `SplitView` (4.15) glides its columns with `cubic-bezier(0.22, 1, 0.36, 1)` over 0.45s.
- All of it is disabled under `prefers-reduced-motion: reduce`. New animations must be too.

### 2.6 Theming

The theme is the `data-theme="light|dark"` attribute on `<html>`, managed by `ThemeService`
(`core/theme.service.ts`). It starts from the stored choice, then the system preference, and
persists to `localStorage`. The header toggle calls `theme.toggle()`. Components never read the
theme; they just use tokens and get both themes for free.

## 3. Global CSS patterns (`styles.css`)

### Buttons

```html
<button type="button" class="btn is-primary">Save</button>
<button type="button" class="btn is-secondary is-small">Cancel</button>
<button type="button" class="btn is-primary is-icon-only" aria-label="Toggle sidebar">
  <i class="fas fa-bars" aria-hidden="true"></i>
</button>
```

Variants: `is-primary` (the one main action), `is-secondary` (outlined), `is-tertiary` (filled,
neutral), `is-inverse`, `is-success`, `is-info`, `is-warning`, `is-error`, `is-transparent`.
Sizes: `is-small`, `is-large`. Shapes: `is-icon-only` (round, **requires `aria-label`**),
`full-width-btn`. Disabled buttons are styled by `:disabled`. Icons are Font Awesome 6 (`fas fa-...`).

### Forms

```html
<div class="form-group">
  <label class="form-label" for="email">Email</label>
  <input id="email" class="form-input" [class.is-error]="invalid" aria-describedby="email-err" />
  <p id="email-err" class="form-error-text" role="alert">Enter a valid email.</p>
</div>
```

`.form-input`, `.form-textarea`, `.form-select` (see Dropdown), `.form-label`, `.required`,
`.form-hint`, `.form-error-text`. Error state: add `.is-error` and link the message with
`aria-describedby`. Always pair inputs with a `<label for>`.

### Cards

```html
<section class="card rise-in" aria-labelledby="h">
  <h2 id="h" class="card-title">Title</h2>
  ...
</section>
```

### Tables

Wrap the table in `.table-container` (border, radius, horizontal scroll). Add `.is-scrollable` to cap
height at 480px with a sticky header.

```html
<div class="table-container">
  <table class="data-table is-striped">
    <caption>Recent trades</caption>
    <thead>
      <tr><th scope="col">Symbol</th><th scope="col" class="is-numeric">Price</th></tr>
    </thead>
    <tbody>
      @for (row of rows(); track row.id) {
        <tr><th scope="row">{{ row.symbol }}</th><td class="is-numeric">{{ row.price | currency }}</td></tr>
      } @empty {
        <tr class="empty-row"><td colspan="2">No trades yet.</td></tr>
      }
    </tbody>
  </table>
</div>
```

Modifiers: `is-striped`, `is-compact` (table); `is-numeric` (cell, right-aligned tabular digits);
`clickable-row` (row; also make it keyboard reachable: `tabindex="0"` + `(keydown.enter)`);
`actions-cell` (buttons); `empty-row`; `<tfoot>` for totals. Always give the table a `<caption>` (or
`aria-label`) and `scope` on header cells.

### Selectable tables (`.row-table`)

One style for every table whose rows open something (Market data and the holdings table). Plain read-only tables
(Order history, Recent orders) stay `.data-table`.

```html
<div class="row-table-scroll">
  <table class="row-table">
    <thead><tr><th scope="col">Instrument</th><th scope="col" class="num">Price</th><th scope="col" class="num col-extra">Prev. close</th></tr></thead>
    <tbody>
      <tr class="is-selected" tabindex="0" (click)="open(row)" (keydown.enter)="open(row)">...</tr>
    </tbody>
  </table>
</div>
```

- Rows are rounded cards that lift on hover; `.is-selected` fills the row with `--accent-primary-background` (text
  `--accent-primary-foreground`, and `--label-subtle` so instrument labels follow). Numbers use `.num`.
- Make rows clickable with `tabindex="0"` plus click / Enter / Space on the `<tr>` (focus ring included), or with a
  `.row-link` button in the first cell whose click area covers the row.
- `.row-table-scroll` is the container: `.col-extra` columns hide below 620px of table width (half-width pane, phone).
  Put `.col-last` on the last always-visible cell of each row so the rounded end stays when the columns after it hide.
- `<tfoot>` rows get a totals style. Component CSS adds only what is specific (chips, status colours).

### Status text

`.status` plus `.is-success | .is-info | .is-warning | .is-error | .is-neutral` colours text with the
container-fg token. Include the status word, not just a colour.

### Empty state and toolbar

`.empty-state` + `.empty-state-text`; `.page-toolbar` (row for search, filters, actions) with
`.search-input` (250px) / `.search-input.small` (150px).

### Modal building blocks

`.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-title`, `.modal-body`, `.modal-footer`.
Prefer `DialogService` for confirmations and `<dialog>` (as `Dialog` and `AuthDialog` do) for
anything custom, so focus trapping and Esc come from the browser.

### Accessibility helpers

`.visually-hidden` (screen-reader-only text), `.skip-link` (already in `app.html`),
global `:focus-visible` outline.

## 4. Components

Import each from its path into a component's `imports: []` array. All are standalone.

### 4.1 Header, sidebar, footer (`layout/`)

Rendered once by `App` (`app.html`). Do not render them per page.

- **`app-header`** (`layout/header/header`): inputs `sidebarOpen` (bool, for `aria-expanded`),
  output `toggleSidebar`. Shows home / sidebar toggle, logo, theme toggle, and either the account
  menu + logout (signed in) or "Login / Register" (guest). Frosted glass via `--shell-*` tokens.
- **`app-account-menu`** (`layout/header/account-menu`): signed-in user menu inside the header.
- **`app-sidebar`** (`layout/sidebar/sidebar`): inputs `open` (bool) and `items`
  (`SidebarItem[]` = `{ route, label, icon }`). **Rendered only when `session.isLoggedIn()`**.
  Collapsed it shows icons with tooltips; expanded it shows labels. To add a page, add an entry to
  `navItems` in `app.ts` and a route in `app.routes.ts`.
- **`app-footer`** (`layout/footer/footer`): static footer.

### 4.2 Dropdown (`shared/ui/dropdown/dropdown`)

A native `<select>` styled with `appearance: base-select`; no positioning code in TypeScript.

```html
<app-dropdown label="Sector" placeholder="Select a sector"
  [options]="sectors" [invalid]="sectorInvalid()" errorText="Please choose a sector."
  [(value)]="sector" />
```

Inputs: `options` (required, `{ value, label, disabled? }[]`), `label`, `placeholder`, `invalid`,
`errorText`, `disabled`, `inputId`, `size` (`'default' | 'compact'`: `compact` is 32px high with 13px text, for dense
toolbars such as the pagination footer). Two-way `[(value)]` (string; `''` = nothing selected).
A11y: the label is a real `<label>`; the error text is linked with `aria-describedby`.

### 4.3 Multiselect (`shared/ui/multiselect/multiselect`)

Chip toggles; selected chips are highlighted and show a check icon.

```html
<app-multiselect label="Watchlist" [options]="symbols" [(selected)]="watchlist" />
```

Inputs: `options` (required, `{ id, label }[]`), `readOnly`, `label` (accessible group name).
Two-way `[(selected)]` (array of ids). Output `touched` (after each toggle). Chips use
`aria-pressed`.

### 4.3b Multi-select dropdown (`shared/ui/multi-dropdown/multi-dropdown`)

A dropdown with checkboxes, for filters. A button shows the choice ("All", the option's label, or
"3 selected") and opens a native popover (light-dismiss, Esc and focus return come from the browser).

```html
<app-multi-dropdown label="Status" [options]="statusOptions" [(selected)]="statuses" />
```

Inputs: `options` (required, `DropdownOption[]`), `label` (required, also the accessible name),
`placeholder` (default `All`). Two-way `[(selected)]` (array of values; empty = no filter). Use the chip
`app-multiselect` for short always-visible sets and this one for filters.

### 4.4 Pagination (`shared/ui/pagination/pagination`)

```html
<app-pagination [totalPages]="totalPages()" [(currentPage)]="page" />

<!-- with a "Rows per page" selector and the "6-10 of 23" range -->
<app-pagination
  [pageSizeOptions]="[5, 10, 25]"
  [(pageSize)]="pageSize"
  [totalItems]="rows().length"
  [totalPages]="totalPages()"
  [(currentPage)]="page"
/>
```

`currentPage` is 1-based (`model.required`), `totalPages` required, output `pageChange` fires only
on user navigation. Slice your data with `computed` from `page()`.

Giving it `pageSizeOptions` adds the **compact `app-dropdown`** labelled "Rows per page" and the range text
(`totalItems` feeds the range). The footer then shows even when everything fits on one page; the page buttons
still appear only when there is more than one. Choosing a size sets `pageSize` and returns to page 1; a size that
was not offered is ignored. Bind `[(pageSize)]` to a signal; use a `linkedSignal` for `page` if it must also clamp
when rows disappear (see the market board and Positions).

### 4.5 Spinner (`shared/ui/spinner/spinner`)

```html
@if (loading()) { <app-spinner label="Loading page" /> }          <!-- page-wide overlay -->
@if (saving())  { <app-spinner [inline]="true" label="Saving" /> } <!-- next to a button -->
```

Default is a full-page overlay; `[inline]="true"` renders a small spinner in the flow. `label` is
announced to screen readers (`role="status"`). Prefer inline for button actions.

### 4.6 Tooltip (`shared/ui/tooltip/tooltip`)

```html
<app-tooltip text="Toggle sidebar" position="bottom">
  <button type="button" class="btn is-icon-only" aria-label="Toggle sidebar">...</button>
</app-tooltip>
```

Inputs: `text`, `position` (`top | right | bottom | left`), `disabled`, `block` (wrapper becomes
`display: block`). Shows on hover **and keyboard focus**, Esc dismisses. Uses CSS anchor
positioning. A tooltip complements, never replaces, an accessible name on the wrapped control.

### 4.7 Dialog (`shared/ui/dialog/dialog` + `core/dialog.service`)

`<app-dialog />` is rendered once in `app.html`. Open it from anywhere:

```ts
private readonly dialog = inject(DialogService);

async cancelOrder(): Promise<void> {
  const ok = await this.dialog.confirm({
    title: 'Cancel order?',
    message: 'This cannot be undone.',
    type: 'warning',          // 'info' | 'success' | 'warning' | 'error'
    confirmText: 'Cancel order',
    cancelText: 'Keep order',
  });
  if (ok) { /* proceed */ }
}
```

Resolves `true` on confirm, `false` on cancel, Esc, close button or backdrop click. For destructive
types (`warning`, `error`) the safe button is the highlighted one. Only one dialog is open at a
time. Built on native `<dialog>.showModal()` (focus trap, Esc, inert background).

### 4.7b Auth dialog (`features/auth/auth-dialog` + `core/auth-dialog.service`)

Sign-in / register / account-setup flow. Open with `authDialog.open('login' | 'register')`. The
route guards use it too.

### 4.8 Notification (`shared/ui/notification/notification` + `core/notification.service`)

`<app-notification />` is rendered once in `app.html` (top-right toasts, `aria-live`).

```ts
private readonly notifications = inject(NotificationService);
this.notifications.success('Order placed');
this.notifications.error(describeError(err));
this.notifications.show('Saved', 'info', 0); // 0 = stay until dismissed
```

Methods: `success`, `error`, `warning`, `info`, `show(message, type, durationMs = 5000)`,
`dismiss(id)`. Keep messages short and actionable.

### 4.9 Side toggle (`shared/ui/side-toggle`)

Buy / Sell segmented control on native radios: `<app-side-toggle [(side)]="side" />`.

### 4.10b Order status badge (`shared/ui/order-status/order-status`)

`<app-order-status [status]="order.status" />` (a generated `OrderStatus`). Each status has its own word and
icon as well as its colour, so it works for colour-blind users: NEW shows **Working**, then **Filled**,
**Rejected**, **Cancelled**. Use it anywhere an order status is shown; never print the raw status.

### 4.10c Order history page (`features/orders`)

Route `/orders`, in the sidebar. It reads from the shared `AccountOverviewStore` and uses the global table classes.

- **Order history:** every order (rejections included), default sort Placed descending, sortable by
  Placed and Symbol (`aria-sort` on the header), filters for Side and Status (multi-select dropdowns) and
  an icon-only Reset button at the right end of the filter row. No order id column.
  **Cancelling:** rows at `NEW` ("Working") are `clickable-row`s (keyboard: Tab, Enter or Space) and can be
  selected several at a time; a selected row is tinted and gets a check mark. While anything is selected an
  icon-only `is-error` trash button appears left of Reset; it asks with `DialogService.confirm` (type
  `warning`), then calls `DELETE /api/v1/orders/{id}` for each, reports successes and failures in toasts and
  refreshes the store. Selections are dropped if the order stops being `NEW` or the filters hide it.
- **Positions:** there is no separate page any more. The holdings are a section of the Portfolio page (4.10d, 4.20); `/positions` redirects to `/portfolio`.
  Order history rows show the logo, symbol and company name (`app-instrument-label`). The dashboard's Recent orders
  panel shows the latest 5 with "View more".
- **Live updates:** while any order is at `NEW` the store re-reads the account on a bounded interval
  (`ORDER_POLL` in `core/order-poll.ts`: 5 s, 12 times), then pauses; `store.refresh()` (the Refresh
  buttons, and placing an order) grants a new allowance. A fill therefore shows up on every page and in
  the order ticket's confirmation without a reload. Never add another polling loop.

### 4.10d Holdings on the Portfolio page

The holdings are the **Holdings section of `/portfolio`** (4.20). The old Positions page is gone: `/positions` redirects to `/portfolio`
and the sidebar has no Positions item. The section is a parent (`Portfolio`) with two presentational children and a detail pane (a split
view, 4.15), all under `features/portfolio`:

| Component | Role |
|---|---|
| `Portfolio` (`portfolio.ts`) | Owns the view switch, paging (`app-pagination` with 10 / 20 / 50 rows) and which position is selected. Rows come from `toPricedRows()` (prices up) or `toUnpricedRows()` (prices down), both in `position-row.ts` |
| `PositionsCard` (`app-positions-card`) | **Default view.** A grid of clickable cards (`auto-fill, minmax(240px, 1fr)`, one per row under 600px): logo, symbol, name, a **price status** badge, the **market value** (the cost basis, labelled, when there is no price), **Unrealised** and **Today** (`app-pnl-value`) and the quantity times the price. Each card is a `<button>` |
| `PositionsTable` (`app-positions-table`) | Table view: instrument, quantity, average cost, cost basis, price, market value, unrealised, today and the price status. No total row: the totals are the summary tiles above. Rows are `clickable-row`s (Tab, Enter, Space) |
| `app-price-status` | The **Live / Delayed / Unavailable** badge, words plus an icon, with the "as of" time when delayed |
| `PositionDetail` (`app-position-detail`) | Opens from either view, in the right-hand pane on wide screens and in a dialog on narrow ones. Symbol, name and cost basis on one line, then quantity and average cost, then **"How your cost basis adds up"**: the filled BUY orders for that symbol (date, quantity, price, cost), a total row and the sum written out (`$8,760.00 ÷ 50 = $175.20`). A sentence covers sells ("selling lowers the quantity, not the average cost") and a note appears when the history does not account for the holding. **Buy more** and **Sell** switch the pane to the shared trade panel (4.16): the same price card and order ticket the market data page uses |

The switch sits at the right of the section title: two icon buttons in a `role="group"`, `aria-pressed`, tooltips ("Card view" with the
four-squares icon, "Table view" with the list icon). The choice is remembered in `localStorage`
(`positions.view`) as a per-browser convenience. The detail follows the live holding from the account store, so quantity and cost update as
orders fill, and keeps the last row if the position disappears (sold out) so the order confirmation stays on screen; it still opens when
prices are down, so a holding can be traded. The breakdown is `positionBreakdown()` in `core/position-lots.ts`; it mirrors the executor's
weighted-average rule.

### 4.10e Market data page (`features/market`)

`/market` ("Market data" in the sidebar) hosts the live market board, which used to sit on the dashboard. The board
(`app-market-board`) and the quote detail (`app-quote-detail`) live in `features/market`. Rows show the instrument
logo. Clicking a row opens the quote detail in a split view (4.15): the table compresses to half the screen and the
detail glides in on the right (a dialog under 1100px). The selected row is filled with the primary colour. The detail
shows the price card (4.16, which also gives the price in your account currency when the instrument is quoted in
another one); **Buy** and **Sell** open the shared trade panel.

### 4.10f Dashboard (`features/dashboard`)

About the user's own account: three stat cards (cash balance, invested at cost, open orders), then **Invested over time**
(a stepped line of what the holdings cost after each filled order, rebuilt from the order history by
`core/invested-history.ts`; it does not move with market prices, and the real performance curve is planned in
`PORTFOLIO_PLAN.md`), **Investments** (donut of holdings by cost with the total in the
middle and a "View portfolio" link; with more than ten holdings the smallest are grouped as "Other"),
**Recent orders** and the watchlist placeholder.

### 4.11 Instrument icon and label (`shared/ui/instrument-icon`, `shared/ui/instrument-label`)

```html
<app-instrument-icon symbol="AAPL" [iconUrl]="row.iconUrl" [size]="36" />
<app-instrument-label symbol="INFY.NS" name="Infosys Ltd" [iconUrl]="row.iconUrl" />
```

`iconUrl` is the instrument's `icon_url` (`/assets/icons/<TICKER>.svg`, upper case; files live in
`frontend/public/assets/icons`). Rendered with `NgOptimizedImage` at the requested size and an empty `alt` (the symbol
is always printed next to it). **A missing URL or a file that fails to load falls back to a tile with the symbol's
first two letters**, so a missing logo never leaves a gap. `app-instrument-label` is icon + symbol + company name; use it
wherever a bare symbol is not enough (position cards and rows, order history, recent orders).

### 4.12 Sheet dialog (`shared/ui/sheet-dialog`)

The modal shell used by the split view (4.15) on narrow screens, and by the other dialogs: a native `<dialog>` (focus trap, Esc, inert
background) with a rounded panel, blurred backdrop and rise-in animation (all disabled under reduced motion).

```html
<app-sheet-dialog [open]="!!selected()" labelledBy="my-title" testId="my-dialog" (closed)="selected.set(null)">
  <h2 id="my-title">...</h2>
</app-sheet-dialog>
```

`(closed)` fires for Esc and a backdrop click; the content provides its own close button.

### 4.13 Donut chart (`shared/ui/donut-chart`)

```html
<app-donut-chart [slices]="slices()" centerLabel="Invested" [centerValue]="total()"
  [valueFormatter]="formatMoney()" ariaLabel="Donut chart of your investments by cost" />
```

`slices` is `{ name, detail?, value }[]`. Highcharts is loaded **lazily** through the `HIGHCHARTS_LOADER` token (its own
chunk, downloaded only when a chart is drawn; specs provide a fake) and runs in **styled mode**: it draws plain SVG
with `highcharts-color-N` classes and `donut-chart.css` fills them from `--data-categorical-1..10`, so the chart
follows the light/dark theme and no colour is written in TypeScript. The component is `ViewEncapsulation.None`
because Highcharts builds its SVG outside Angular's templates; every selector is prefixed `.donut-chart`. The legend is
real HTML (swatch, name, share, value); the SVG is a labelled image. Ten colours; beyond that the caller groups the tail
into "Other".

### 4.13b Line chart (`shared/ui/line-chart`)

```html
<app-line-chart [points]="points()" seriesName="Invested at cost" [valueFormatter]="formatMoney()"
  ariaLabel="Line chart of the cost of your holdings over time" />
```

`points` is `{ time, value }[]` (epoch milliseconds). Same approach as the donut: Highcharts through `HIGHCHARTS_LOADER`,
styled mode, `ViewEncapsulation.None`, colours only from tokens (`--accent-primary-background` for the line and its
fill, `--surface-line-subtle` for the grid). It draws a stepped area (it holds a value until the next point), a time
axis starting at zero and a tooltip with the date and the formatted value. Put the numbers that matter in text next to
the chart; the SVG is a labelled image.

### 4.14 Order ticket, confirmation and side toggle (`shared/ui/order-ticket`, `order-confirmation`, `side-toggle`)

Moved from `features/dashboard` so any screen can trade. It is embedded by the trade panel (4.16), which the quote
detail (market board) and the position detail (Positions) both use: `<app-order-ticket [row]="marketRow" [(side)]="side" (cancelled)="..." (done)="..." />`.
`MarketRow` (`core/market-row.ts`) is the instrument as the ticket needs it: quote, change, previous close, currency.
For an instrument quoted in another currency than the account the ticket shows the estimate in both, compares cash in
the account currency (using the rates `MarketService.fxRates()` keeps from the market board), and the confirmation shows
the limit price in the account currency. See `CURRENCY.md`.

### 4.15 Split view (`shared/ui/split-view`)

A list with a detail pane beside it. On wide screens (`min-width: 1100px`, exported as `SPLIT_VIEW_QUERY`) selecting
something compresses the list to half the width and glides the detail in on the right; under that width the same
detail opens in a `SheetDialog` (4.12), so mobile keeps the pop-up. Market data and Positions both use it.

```html
<app-split-view [open]="!!selected()" labelledBy="detail-title" testId="my-detail" (closed)="selected.set(null)">
  <div list>...table or cards...</div>
  <div detail>@if (selected(); as row) { <app-quote-detail [row]="row" (closed)="selected.set(null)" /> }</div>
</app-split-view>
```

| Input / output | Meaning |
|---|---|
| `open` | Whether a detail is showing |
| `labelledBy` | Id of the heading inside the detail (the shared header uses `detail-title`), for `aria-labelledby` |
| `testId` | `data-testid` of the pane (or of the dialog on narrow screens) |
| `(closed)` | Esc inside the pane, or Esc / backdrop click on the dialog; the detail also has its own close button |

How it behaves:

- **The slide.** `.split` is a grid whose columns are `1fr 0` closed and `1fr calc(50% + gap / 2)` open (a percentage: `cqw` on the grid itself would resolve against an ancestor container and shrink the page), so only
  lengths and `fr` are interpolated and the grid animates smoothly (0.45s, ease-out). The detail panel keeps its final
  width the whole time and the column clips it, so it is revealed rather than squeezed and reflowed. Do not animate a
  column to `minmax(...)` or between `fr` units; it jumps.
- **Compressing.** The list is a container. Tables hide low-priority columns (`.col-extra`) with `@container`
  queries, so they cope with the half-width pane and a phone alike; never pass a "compact" flag down.
- **Selection.** Selected card: primary border plus `--accent-primary-container-background`. Selected table row: the
  full `--accent-primary-background` with `--accent-primary-foreground` text (and `--label-subtle` set to the same, so
  instrument labels stay legible). Tokens only; the selected item also carries `aria-current` or is the button that
  opened the pane.
- **Focus.** The pane takes focus when it opens (`tabindex="-1"`), Esc closes it.
- **Without `matchMedia`** (jsdom, old browsers) it uses the dialog.
- Motion is disabled under `prefers-reduced-motion`.

### 4.16 Quote summary and trade panel (`shared/ui/quote-summary`, `shared/ui/trade-panel`)

The detail pane for an instrument. Both pages share the second screen so buying and selling looks and works the same
wherever it starts.

- `app-quote-summary` takes a `MarketRow`: the header (logo, symbol with id `detail-title`, name, asset chip, close
  button) and the gradient **price card** (price, change chip, previous close, date, and the account-currency
  equivalent for other currencies).
- `app-order-ticket` is described in 4.14.
- `app-trade-panel` puts the two together: price card on top, order ticket below. Inputs `row` and `side`
  (`model`); outputs `cancelled`, `done`, `closed`.
- **First screens differ, second screen is shared.** `QuoteDetail` shows the price card, a chart placeholder and
  Buy / Sell. `PositionDetail` shows the holding (quantity, average cost, the buys behind it). Buy / Sell on either
  opens `app-trade-panel`. A mode change is kept while the same instrument gets fresh prices and resets for another.

### 4.18 Notification bell and page (`layout/notifications`, `features/notifications`)

`app-notification-bell` is one of the sidebar's navigation links (`app-sidebar` renders it after the page links, so it is
always reachable and never pinned under the footer, and exists only while signed in): an `<a routerLink="/notifications">`
styled like a sidebar link, a bell icon and an unread **badge** (solid error-token pill with the count as text, `99+` above 99;
`aria-hidden`, the count is in the link's `aria-label`). Input `expanded` shows the "Notifications" label. It is highlighted
like the other links while the notifications page is open.

The **Notifications page** (`/notifications`, `app-notifications-page`) replaces the earlier pop-up, because an inbox can hold
hundreds of items: a title with "N unread" / "You are all caught up", a search box (debounced 300 ms), a category
`app-multi-dropdown`, the list (newest first, as long as the page size; the page scrolls), `app-pagination` with a "Rows per
page" selector, and empty, loading and error states. Unread items carry an accent edge, a dot and a bold title; read ones show
the word "Read" (never colour alone) and drop out of the list an hour after they were read. Each item is a `<button>` whose
`aria-label` starts "Unread:" or "Read:". Clicking an unread one marks it read.

State lives in `NotificationInboxStore` (`core/notification-inbox.store.ts`): the applied query, categories, page and
page size, the loaded page, `unreadCount` (what the badge shows) and a 30-second refresh. Components hold only what is
being typed. The bell does not use `.sidebar-link` (that class is scoped to the sidebar), so `notification-bell.css`
repeats its few spacing rules with the same tokens. The footer's `--footer-z` is below the sidebar's, so the footer scrolling
into view never covers the navigation.

### 4.19 Watchlist panel: add dropdown and price alerts

The "Add a stock" control is the shared `app-dropdown` of every tradable instrument on the market board that is not on
the list already, labelled "SYMBOL, name", with **Add disabled until one is chosen** (and at the per-list limit). There is
no free-text box and no `datalist`.

The table has an **Alert** column. An entry without an alert shows a tertiary "Set alert" button; with one it shows a
chip (`is-active` info tokens, `is-triggered` success tokens, `is-failed` error tokens, each with an icon and words) and,
below it, "Active" or "Hit 201.25 · Notified / Sending… / Delivery failed". Opening it shows an editor row under the
entry: an `app-dropdown` for the direction ("Rises to or above", "Falls to or below"), the target price, **Set alert /
Update alert** (disabled until the target is a valid price the market has not already reached; the form says why), Remove
alert and Cancel. Server errors (`ALR-409`, `ALR-422`) show inside the editor. Set alert is disabled on every entry once
the account has 20 active alerts, except entries that already have one (replacing does not add to the count).

### 4.20 Portfolio page (`features/portfolio`)

`/portfolio` (sidebar: **Portfolio**) is the account's statement: what it is worth now, how it has done, what it holds and where the profit
and loss came from. It is one page of independent sections, in this order:

1. **Header**: the title, "Prices as of ..." (with a **Delayed** badge when any served price is old) and **Refresh** (the account and every section).
2. **Tiles** (`.card.tile`, a grid of three, two below 1000 px, one below 560 px): *Total value* (the featured gradient tile, the only one),
   *Cash*, *Market value* (with the cost under it), *Unrealised P&L*, *Realised P&L*, *Today*. Figures are in the account currency and
   formatted by the preference pipes.
3. **Performance** (`app-portfolio-performance`): the graph, straight under the tiles (below).
4. **Holdings**: the cards and table of 4.10d, with the position detail.
5. **Profit and loss by instrument** (below).

* **Sections load on their own.** The page is three resources in `PortfolioStore`: the summary and priced positions (`data`), profit and loss
  by instrument (`pnl`) and the history (`performance`). Applying the realised date filter reloads **only** the profit-and-loss section, which
  shows its own spinner ("Loading profit and loss...", `aria-busy` on the section); the benchmark toggle reloads only the performance section.
  The tiles, holdings and graph stay on screen and make no request. The page-level spinner appears only for the first load.
* **Performance section.** A range switch (1M, 3M, 6M, 1Y, All; changing it reloads nothing, the points are already there), a
  "Compare with SPY" checkbox, the range figures (return, profit, annualised for a range over a year, max drawdown, best and worst day) and
  the **shared `app-line-chart`**, drawn as percent change from the start of the range, with the benchmark as a second series. The chart has an
  `aria-label` giving the range and the return; the same figures and a **Daily statements** table (value, day P&L, unrealised, realised total,
  NAV, newest first, 30 shown and "Show all") carry the numbers for anyone who does not read the chart. Estimated days are flagged in words
  ("Estimated") and a note says some prices were estimated. States, all inside the section: loading, "We are preparing your history" (HTTP 202,
  asked again every 4 seconds a bounded number of times), an error card with **Try again**, and "Your curve starts tomorrow" under two closed days.
  It measures with the NAV, so money put in or taken out never looks like a gain or a loss.
* **`app-pnl-value`** (`shared/ui/pnl-value`) shows every profit or loss: a sign (`+` or `-`), an arrow icon (`fa-arrow-trend-up` / `-down` / `fa-minus`), the amount,
  and an optional percentage, in the success or error container tokens. **Colour is never the only signal.** A figure that is not known
  shows a dash with the screen-reader text "Not available", never a zero.
* **Price status** is words plus an icon (`app-price-status`): **Live** (success tokens, a dot), **Delayed** (warning tokens, `fa-clock`, with the "as of" time) or **Unavailable**
  (error tokens, `fa-triangle-exclamation`). A holding that could not be priced is still listed: its card shows the cost basis (labelled), its table row "No price" and a dash.
* **Freshness.** When some holdings could not be priced, a `role="status"` warning says how many and that the totals cover only the others.
* **Pricing unavailable (`MKT-503`).** Not an error screen: a `role="alert"` notice ("Prices are unavailable right now") with **Try again**,
  the cash, the cost of the holdings and, because realised profit and loss needs no price, the **Realised P&L** tile (read from its own route;
  left out only if that fails too), the performance section (it reads stored statements), and the holdings listed as unavailable. Profit and loss by
  instrument says it needs prices. Any other failure is the usual error card with a retry.
* **Profit and loss by instrument**: a `.row-table` of realised, unrealised and total per symbol, above which a small form (Signal Forms) bounds the
  **realised** figure by two dates. A start after the end is refused with an inline message and Apply stays disabled; the hint says the dates
  bound realised only and unrealised is always as at now.
* State lives in `PortfolioStore` (`core/portfolio.store.ts`); `autoRefresh()` is started by the page while it is open (every minute; the server caches quotes) and
  stops when it closes. The page only holds what is being typed, the view, the page and the selection.

### 4.10 `NoClipboard` directive (`shared/directives/no-clipboard`)

`<input type="password" appNoClipboard (clipboardBlocked)="explain()">` blocks copy / cut / paste /
drag on password fields (autofill still works) and emits so the form can say why.

### 4.17 Settings, preferences and the formatting pipes

`/settings` (`features/settings`) is one form with one Save. It edits a **draft**: nothing changes elsewhere until Save,
and the preview under "Display" is drawn from the draft. The whole document goes to the Trade API in a single `PUT`.

| Setting | Control | Applied by |
|---|---|---|
| Channel of communication (SMS, Email, In-application, No notifications) | `app-multiselect` | Stored; the notification path reads it through `PreferenceResolver` (Java, in-process) |
| Notification categories | `app-multiselect` | Stored, same as above |
| Account currency | `app-dropdown` | Converts the real account on save (after a confirmation); the whole UI then follows the account |
| Date, time, number format | `app-dropdown` | The formatting pipes, `Intl` in the charts and the chart tooltip |
| AI assistant | `app-dropdown` | `app-chat-assistant` (the icon) in the app shell |
| Theme, landing page, order ticket type | `app-dropdown` | `ThemeService.apply`, `AuthDialog` / `guestGuard`, `OrderTicket` |

- **`PreferencesStore`** (`core/preferences.store.ts`) loads once per sign-in (one `GET`), saves with one `PUT`, never polls and
  never fails a page: until something loads, or if loading fails, every reader gets the defaults.
- **`FormatPreferences`** holds only the three format signals, with no HTTP, so the pipes can depend on it anywhere.
- **Pipes.** In a component, import `PreferenceDatePipe`, `PreferenceDecimalPipe` and `PreferenceCurrencyPipe` from
  `shared/formatting/preference-pipes` instead of Angular's `DatePipe`, `DecimalPipe` and `CurrencyPipe`. They keep the same
  names (`date`, `number`, `currency`), so templates do not change. `mediumDate`, `mediumTime` and `medium` follow the
  customer's formats; any other pattern passes through untouched. They are impure on purpose (see the file comment).
  Do not import Angular's own three pipes in new UI, or that screen ignores the customer's formats.
- **`app-chat-assistant`** is shown only when the customer switched it on. There is no assistant service yet, so its panel says so.

## 5. Services the UI relies on

| Service | Purpose |
|---|---|
| `ThemeService` | `isDark()`, `toggle()` |
| `NotificationService` | Toasts |
| `PortfolioStore` | The signed-in customer's portfolio in three independent resources: `data` (summary and priced positions: `snapshot()`, `unavailable()` for `MKT-503`), `pnl` (by instrument, reloaded alone when the realised date range changes) and `performance` (the closed-day history, reloaded alone by the benchmark toggle; polled while it is being built), plus `autoRefresh()` (started by the page while it is open) |
| `NotificationInboxStore` | The customer's notification inbox: the page being viewed (query, categories, page, size), `items()`, `unreadCount()` (the bell badge), `markRead()`, refreshed every 30 s. Not to be confused with `NotificationService` (toasts) |
| `DialogService` | Promise-based confirmations |
| `AuthDialogService` | Open the sign-in / register dialog |
| `SessionService` | `isLoggedIn()`, `username()`, `session()`, `start()`, `renew()`, `clear()`. Holds only `{ username, expiresAt }` (persisted to localStorage, followed across tabs). **No tokens**: they are HttpOnly cookies, see `AUTH-COOKIES.md` |
| `TokenRefresher` | `refresh(staleExpiresAt)`, `endSession()`. Single-flight (refresh tokens rotate; reuse revokes the chain). Calls `/auth/refresh` with no body (the refresh cookie is the credential). Used by `authInterceptor`: renews before a call when the access cookie is about to expire, and once on a 401, then retries. If the refresh is refused it clears the session, shows a toast and navigates to `/` |
| `authInterceptor` | Sends calls to the platform APIs with credentials and `X-Requested-With` (the CSRF guard); never attaches a token. Also opts login / refresh / logout into credentials so the cross-origin cookies are stored and sent |
| `MarketService` | `getBoard()` (live quotes) and `fxRates()`, the exchange rates the latest board carried (for estimates only; the backend converts for real) |
| `describeError(err)` (`core/errors`) | Turns any HTTP failure into a user-facing sentence from the contract's `errorCode` |

## 6. Recipes

**Form submit with inline spinner and error toast**

```html
<button type="submit" class="btn is-primary" [disabled]="saving()">Save</button>
@if (saving()) { <app-spinner [inline]="true" label="Saving" /> }
```
```ts
async submit() {
  this.saving.set(true);
  try { await ...; this.notifications.success('Saved'); }
  catch (e) { this.notifications.error(describeError(e)); }
  finally { this.saving.set(false); }
}
```

**Paginated table:** `rows = computed(() => all().slice((page() - 1) * SIZE, page() * SIZE))`, render
inside `.table-container`, then `<app-pagination>` below.

**Destructive action:** `await dialog.confirm({ type: 'warning', ... })`, act only if `true`.

## 7. Contributing checklist

- [ ] No hardcoded colours (`grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" ` in your changed files)
- [ ] Looks right in light **and** dark
- [ ] Keyboard-only walkthrough works; focus is visible; labels and `aria-*` present
- [ ] Reused a global class or shared component instead of copying CSS
- [ ] New shared component? Add it to `/showcase` **and** to section 4 of this file
- [ ] New token? Defined in both themes and listed in section 2

## 8. Known limits

- Icons come from the Font Awesome CDN stylesheet in `index.html`; offline or blocked CDN means no icons
  (buttons keep their `aria-label`).
- The dropdown (`appearance: base-select`) and tooltips (CSS anchor positioning) need a current
  Chromium-based browser. Other browsers fall back to a plain native select / unpositioned tooltip.
- The Fidelity Sans font files load from the Fidelity CDN; the fallback is the system sans-serif.
