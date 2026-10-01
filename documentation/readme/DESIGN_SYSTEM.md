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

## 1. Rules

1. **Colours come from tokens only.** Never write a hex value, `rgb()`, `rgba()`, `hsl()` or a colour
   keyword (`white`, `red`, ...) in a component stylesheet or template. Use `var(--token)`. The only
   file that defines colour values is `styles.css`. Need a new colour? Add a token to **both** the
   light (`:root`) and dark (`:root[data-theme="dark"]`) blocks.
2. **Overlays and dimming** are done with a token plus `opacity` (see `.modal-overlay::before`), not
   with a translucent colour.
3. **Cards** are `class="card"`: `1px solid var(--surface-line-subtle)`, `var(--radius-card)`,
   `var(--card-shadow)`. Do not restyle the border.
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
`errorText`, `disabled`, `inputId`. Two-way `[(value)]` (string; `''` = nothing selected).
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
```

`currentPage` is 1-based (`model.required`), `totalPages` required, output `pageChange` fires only
on user navigation. Slice your data with `computed` from `page()`.

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

### 4.9 Side toggle (`features/dashboard/side-toggle`)

Buy / Sell segmented control on native radios: `<app-side-toggle [(side)]="side" />`.

### 4.10b Order status badge (`shared/ui/order-status/order-status`)

`<app-order-status [status]="order.status" />` (a generated `OrderStatus`). Each status has its own word and
icon as well as its colour, so it works for colour-blind users: NEW shows **Working**, then **Filled**,
**Rejected**, **Cancelled**. Use it anywhere an order status is shown; never print the raw status.

### 4.10c Order history and Positions pages (`features/orders`, `features/positions`)

Routes `/orders` and `/positions`, both in the sidebar. Both read from the shared `AccountOverviewStore`
and use the global table classes.

- **Order history:** every order (rejections included), default sort Placed descending, sortable by
  Placed and Symbol (`aria-sort` on the header), filters for Side and Status (multi-select dropdowns) and
  an icon-only Reset button. No order id column.
- **Positions:** quantity, average cost and cost basis per symbol, a Symbol filter and a total row.
  The dashboard's Positions card links here; its Recent orders panel shows the latest 5 with "View more".
- **Live updates:** while any order is at `NEW` the store re-reads the account on a bounded interval
  (`ORDER_POLL` in `core/order-poll.ts`: 5 s, 12 times), then pauses; `store.refresh()` (the Refresh
  buttons, and placing an order) grants a new allowance. A fill therefore shows up on every page and in
  the order ticket's confirmation without a reload. Never add another polling loop.

### 4.10 `NoClipboard` directive (`shared/directives/no-clipboard`)

`<input type="password" appNoClipboard (clipboardBlocked)="explain()">` blocks copy / cut / paste /
drag on password fields (autofill still works) and emits so the form can say why.

## 5. Services the UI relies on

| Service | Purpose |
|---|---|
| `ThemeService` | `isDark()`, `toggle()` |
| `NotificationService` | Toasts |
| `DialogService` | Promise-based confirmations |
| `AuthDialogService` | Open the sign-in / register dialog |
| `SessionService` | `isLoggedIn()`, `username()`, `accessToken()`, `start()`, `clear()` |
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
