# 04 · UI: one profile icon, one pane for user and account details

Status: **plan**.

## 1. Today

The header shows two controls for the same person:

| Control | Component | What it does |
|---|---|---|
| User icon (`data-testid="open-profile"`) | `layout/header/header.html` -> `ProfileDialog` (`layout/header/profile-dialog`) | Opens a modal with username, email, member-since, two-step sign-in status and a **Change password** form. Loads `GET /auth/me` |
| Username chip (`data-testid="header-username"`) | `AccountMenu` (`layout/header/account-menu`) | Hover/click panel with the trading account: number, cash balance, holder, status, currency, balance time. Reads `AccountOverviewStore` (order-service) |

## 2. Target

Header keeps **one** icon-only button (the person icon, no username text, no chevron). Clicking it opens **one popover
pane** that shows everything about the signed-in person, from both services, in a tidy layout. The logout button stays
beside it.

```
 [theme]  [ (o) ]  [logout]
             |
             v
   +------------------------------+
   |  (A)  yuvaraj21.k            |   <- initial avatar, username, email
   |       you@example.com        |
   |------------------------------|
   |  TRADING ACCOUNT             |
   |  ETP-000123        [Active]  |   <- account number, status badge
   |  $12,430.55   cash           |   <- balance (preference currency pipe)
   |  Holder      Yuvaraj K       |
   |  Currency    USD             |
   |  As of       Oct 7, 10:02    |
   |------------------------------|
   |  SIGN-IN SECURITY            |
   |  Two-step sign-in   On  ->   |   <- link to Settings
   |  Member since       Mar 2026 |
   |  [ Change password ]         |
   +------------------------------+
```

## 3. Data (no new endpoints)

| Section | Source | Notes |
|---|---|---|
| Identity, security | auth-service `GET /auth/me` (username, email, `createdOn`, `twoFactorEnabled`) | Already used by the dialog. Move the call into a small `ProfileStore` (`@Service()`, `resource()`), shared and cached |
| Trading account | order-service via the existing `AccountOverviewStore` (`linked()`, `overview.account`, `overview.balance`) | Already loaded for the whole app, so the account half is instant |
| No account linked | Existing "Open my account" call-to-action (`AuthDialogService.open('account')`) | Keep |

Behaviour: load `/auth/me` the first time the pane opens (not at start-up), and refresh it every time it opens
(stale-while-revalidate: show what we have, update when the answer arrives). Each half has its own loading and error state, so
a failure in one service does not hide the other.

## 4. Interaction and accessibility
- Replace hover-to-open with **click only** (hover panels with forms in them are fragile and unreachable by keyboard/touch).
- Disclosure popover: `aria-expanded`, `aria-controls`, `aria-haspopup="dialog"`; the pane is `role="dialog"` with
  `aria-labelledby` (the username), focus moves into it on open and returns to the button on close; **Esc** and outside click close it.
- **Change password**: keep the existing form, but as a second view **inside the pane** (the pane swaps content and has a "Back" button),
  so there is no dialog on top of a popover. The form and its tests move with it. If that makes the pane too tall on small screens, fall back to
  opening the existing `ProfileDialog` from the button; decide when building (the form code is shared either way).
- Under 600px the pane becomes a bottom sheet (`SheetDialog` / `<dialog>`), consistent with the split view's mobile behaviour.
- Tokens only, no shadows (the pane uses border + `--surface-background-bright`, like the other panels). `prefers-reduced-motion` respected.
- The button needs an accessible name that includes the user: `aria-label="Account menu for {username}"`, because the visible username is gone.

## 5. Work breakdown
1. `ProfileStore` (`core/profile.store.ts`): `GET /auth/me`, error text via `describeError`. Spec.
2. New `ProfileMenu` component (`layout/header/profile-menu/`), built from `AccountMenu` + `ProfileDialog` parts; remove both old components once
   their content is moved. Reuse `PreferenceCurrencyPipe`/`PreferenceDatePipe`, `Spinner`, status badge classes.
3. `header.html`: one button (`data-testid="open-profile"` kept so existing selectors still find the control) + `<app-profile-menu>`; delete the username chip.
4. Move the change-password form (Signal Forms, `appNoClipboard`, validators) with its error handling unchanged.
5. Update tests: `header.spec.ts`, `account-menu.spec.ts` (-> `profile-menu.spec.ts`), `profile-dialog.spec.ts`.
6. **e2e**: `e2e/support/ui.ts` and `e2e/sign-in.spec.ts` read the username from `header-username`. Point them at the pane
   (open it, read `[data-testid="profile-username"]`) or at the button's `aria-label`; add a small `openProfile()` helper.
7. `DESIGN_SYSTEM.md`: replace the "Header, sidebar, footer" account text with the new pane; add the popover pattern if reused later.

## 6. Acceptance criteria
- One control in the header for the profile; no username text.
- Opening it shows user details and account details together; each section degrades independently (loading, error, no account).
- Password change still works, with the same validation messages and the clipboard guard.
- Keyboard: Tab reaches the button, Enter/Space opens, focus is trapped sensibly, Esc closes and returns focus. AXE clean.
- Light and dark themes both checked.

## 7. Open questions
1. Show the balance in the pane, or only the account identity (balance is already on the dashboard)? Recommendation: keep it, it is what the old hover panel showed.
2. Add a sign-out button inside the pane as well? Recommendation: no, the header already has one.
