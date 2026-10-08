# 12 · Account currency: chosen once when the account is opened, never changed afterwards

Status: **plan**.

## 1. Why

Today the currency is an editable preference in **Settings**. Saving a different one **converts the account**: the cash balance, purchasing power, the price of every order and the
purchase price of every holding are multiplied by one exchange factor (`PreferencesService.changeAccountCurrency`). That means a settings change rewrites real money values at
whatever the rate is that day, going from USD to EUR and back does not return the original numbers, and it needs special handling (open orders block it with `ACC-409`,
no rate gives `FX-503`, a confirmation dialog, a warning note in the form). It is the wrong kind of setting.

New rule: **the currency is a property of the account, chosen once during account setup, shown read-only afterwards.** Everything that is stored "in the account currency"
(`CURRENCY.md`: orders, holdings, balances, cost basis) is then stable for the life of the account.

## 2. What already exists (so the change is small)

| Piece | State today |
|---|---|
| `account.currency` column | Exists (`CHAR(3)`), already on every account, already returned in the balance, account overview and portfolio responses |
| Account opening | `POST /api/v1/accounts/create` (`CreateAccountRequest`: `client_name`, `phone_no`, `email`, optional `dob`, optional `balance`). `TradeService.createAccount` **hard-codes `"USD"`** (line ~627) |
| Supported list | `SupportedCurrencies`: USD, EUR, GBP, INR, JPY, CAD, AUD, CHF, SGD, CNY. The frontend has `CURRENCY_OPTIONS` for the same list |
| Opening balance | Optional, default and minimum **20,000** (`MIN_OPENING_BALANCE`, message "at least 20000"), a plain number with no currency attached |
| Preferences | `preferredCurrency` is part of `GET/PUT /api/v1/accounts/{id}/preferences`; `GET` always returns the account's currency; `PUT` with another one converts the account |
| Settings screen | Dropdown "Account currency", a confirm dialog "Change your account currency?", a note, and a block while orders are open (`settings.html`, `settings.ts`) |
| Account setup screen | `features/auth/account-setup-form`: name, phone, email, optional date of birth, optional opening balance. No currency |

## 3. Target behaviour

1. **Account setup** gets a **Currency** dropdown (shared `app-dropdown`, the ten supported currencies, default **USD**), placed next to the opening balance, with one line of help:
   "Chosen once. It cannot be changed later." Nothing else about currency is asked.
2. The opening balance label shows the symbol of the chosen currency (and the minimum, see 4.2).
3. **Settings** shows the currency as a **read-only fact**: "Account currency: **EUR**. Set when your account was opened." No dropdown, no confirmation dialog, no open-orders warning.
4. Everything else is unchanged: the **display** preferences (date format, number format, theme, landing page, notification choices) stay editable. A customer can still see estimates in
   their own terms through the market page, which already shows an "approx. in your currency" figure for instruments quoted elsewhere.

## 4. Changes

### 4.1 API and contract
| Change | Detail |
|---|---|
| `trade-api.yaml` `CreateAccountRequest` | Add optional `currency` (ISO 4217, one of the supported list; **default `USD`** so existing clients keep working). Field naming stays snake_case style of that request, so `currency` (a single lowercase word needs no change) |
| `CreateAccountResponse` | Add `currency` so the UI can show it without another call |
| `preferences-api.yaml` | `preferredCurrency` stays in the **response** (always the account's currency, read-only). In the **PUT** it becomes optional and, if present, **must equal the account's currency**, otherwise a new error `CUR-409` (409): "The account currency is set when the account is opened and cannot be changed." Remove the "Changing the currency" section, `CurrencyChangeBlocked` and the `FX-503` response from this route |
| `contracts/CONTRACT-CHANGES.md` | Record both changes; note it is backward compatible for clients that send the current currency |

### 4.2 order-service
| Change | Detail |
|---|---|
| `AuthAccountsController` / `TradeService.createAccount` | Validate `currency` against `SupportedCurrencies` (`422` with the existing invalid-input style), use it instead of `"USD"` |
| Opening balance minimum | 20,000 is a USD-sized number; 20,000 JPY is about 130 dollars. Use a **per-currency minimum table** in configuration (`account.opening.minimum.USD=20000`, `EUR=18000`, `GBP=16000`, `INR=1600000`, `JPY=3000000`, ...) so there is no exchange-rate call at account creation, and the amounts are deterministic. The error message names the currency and the minimum. (Alternative: keep one number for all; simpler, but meaningless in JPY.) |
| `PreferencesService` | Delete `changeAccountCurrency`, `CurrencyChangeBlockedException`, the mapper's `updateAccountCurrency` and the use of `CurrencyConversionService` here; `save` rejects a different currency with `CUR-409` and ignores an equal one. The currency conversion service **stays** for orders (instrument currency to account currency) |
| `UpdatePreferencesRequest` | `preferredCurrency` optional |
| Tests | Remove the conversion and open-order-block tests; add: creates in EUR, defaults to USD, unsupported currency is `422`, per-currency minimum, PUT with the same currency is fine, PUT with another is `CUR-409` and changes nothing, GET returns the account's currency |
| Data | No migration. Existing accounts keep whatever currency they have (sample data has EUR and GBP accounts on purpose) |

### 4.3 Frontend
| Change | Detail |
|---|---|
| `account-setup-form` | Add `currency` signal-form field with the shared dropdown; pass it in `createAccount`; minimum balance validation uses the per-currency minimum (value from a small constant mirrored from the server, or taken from a `GET` on the config if we add one; start with the constant, the server remains the authority); show the symbol in the balance field |
| `settings` | Remove the currency dropdown, `confirmCurrencyChange`, the open-orders block and notes; show a read-only line. The format-preview that uses `preferredCurrency` uses the account currency instead |
| `preferences.store` / `preferences.ts` | `preferredCurrency` becomes derived from the account (read-only); stop sending a changed value |
| Generated clients | `npm run api:generate` after the contracts change |
| Specs | `account-setup-form.spec` (currency chosen and sent, default USD, balance symbol and minimum), `settings.spec` (no currency control, read-only text, saving other preferences does not touch the currency), `preferences.*.spec` |
| e2e | Search `e2e/` for currency changes in Settings; remove them. The account setup journey picks the default |

### 4.4 Documentation
`CURRENCY.md` (new section "The account currency is fixed at opening"), `preferences-api.yaml` description, `STRATEGIES.md` mention of currency if any, and `DESIGN_SYSTEM.md` not affected.

## 5. Things to double-check while building
- `preferred_currency` may also be stored as a column in the preferences table; if so, stop writing it and read the account's currency (the code already overrides it on read).
- Anything that listens for "currency changed" to refresh data (stores, FX estimates, quote summary account equivalent) can drop that path.
- The dashboard, portfolio and orders pages already format with the account currency; they need no change.

## 6. Acceptance criteria
- A new customer picks a currency in account setup; the account, its balance and every later price/portfolio figure use it from the first request.
- Settings has no control or code path that can change it; the API refuses a different value with `CUR-409` and changes nothing.
- Existing accounts and sample data are unaffected; display preferences still save.
- No exchange-rate call happens at account creation.

## 7. Decisions
| # | Question | Recommendation |
|---|---|---|
| D1 | Opening-balance minimum | Per-currency table in config (no FX dependency) |
| D2 | Default currency in the dropdown | USD (the current behaviour); could later default from the browser locale |
| D3 | A "contact support to change currency" path | Out of scope; mention it in the help text only if you want one |
