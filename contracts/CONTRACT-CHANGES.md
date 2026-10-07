# Contract changes: aligning the contracts with the implementation

The YAMLs in this folder are the source for the Angular clients (`frontend/src/app/api/generated`,
regenerate with `npm run api:generate`). They had drifted from the running services, so they were
updated to match the code. This file records every change and where the code that justifies it lives.

Rule of thumb applied: **where the code and the contract disagreed, the contract was changed to
describe the code.** If a team decides the code is wrong instead, revert that item here and fix the
service, then regenerate.

## auth-api.yaml (NestJS auth service, `backend/auth-service`)

### Added
| What | Why / evidence |
|---|---|
| `GET /health` (`getHealth`, tag `Health`, no auth) and schema `HealthResponse` (`{ status: "ok" }`) | Implemented in `src/health/health.controller.ts`; used for container health checks. |

### Removed or changed
| What | Before | Now | Evidence |
|---|---|---|---|
| `RegisterRequest.accountId` | required integer | removed | `RegisterDto` has no `accountId`, and the global `ValidationPipe` uses `forbidNonWhitelisted`, so sending it returns 422. The frontend never had an account id at registration time. |
| `UserResponse.accountId` | required integer | removed | `AuthService.userToResponseDto` returns `id`, `username`, `roles`, `createdOn` only. |
| `UserResponse.id` | string, uuid | integer int64 | `UserResponseDto.id` is a number (`users.id`). |
| JWT claim `sub` | string UUID | integer user id | `buildAccessToken` signs `sub: user.id` (numeric). |
| JWT claim `accountId` | required | removed | `buildAccessToken` puts only `sub`, `roles`, `iat` (plus `exp`, `iss`) in the token. |
| `/auth/register` description | "links it to an existing trading account" | user is created only; account is opened via the Trade API afterwards | `AuthService.register` creates a `CUSTOMER` user and nothing else. |
| `/auth/me` description | "learn which account to address" | points to `GET /api/v1/accounts/link` | `getUser` returns no account information. |

### Added: `email`

| What | Why / evidence |
|---|---|
| `RegisterRequest.email` (optional, `format: email`, max 255) | `RegisterDto.email` in `src/auth/dto/index.ts`; the service defaults it to `<username>@local.auth`. With `forbidNonWhitelisted`, a client that cannot send it is forced to use that default. The UI sends the real address. |
| `UserResponse.email` (required) | `AuthService.userToResponseDto` returns it; `/auth/me` uses it to pre-fill account setup. |

### Why `accountId` mattered
The old contract made `accountId` a required field at registration and a required claim in every
token. The implementation instead links a user to an account **inside the Trade API** (by user id,
`accounts.user_id`). With the old contract the generated client would have refused to compile a
`register()` call without an `accountId` that the UI has no way to know, and the token claim the
contract promised never existed. Since the frontend and backend both work without it, the contract now
says so.

Not changed: `SetupProfileDto` / `SetupProfileResponseDto` exist in `src/auth/dto/index.ts` but no
controller route uses them, so they were **not** added.

## trade-api.yaml (Spring Boot, `backend/trade-api`)

### Added: endpoints (tag `Onboarding`)
| Endpoint | operationId | Evidence |
|---|---|---|
| `POST /api/v1/accounts/create` | `createAccount` | `AuthAccountsController.createAccount` |
| `GET /api/v1/accounts/link` | `getAccountLink` | `AuthAccountsController.linkAccount` |

`create` opens an `ACTIVE` account linked to the token's user, one account per user. `link` reports
whether the user already has one (`linked: false` is a normal answer, not an error).

### Added: schemas
| Schema | Notes |
|---|---|
| `CreateAccountRequest` | Fields are snake_case (`client_name`, `phone_no`) because the Java record uses `@JsonProperty`. `email` required; `dob` and `balance` optional. Constraints copied from the record's validation annotations. |
| `CreateAccountResponse` | `accountId` (numeric key), `accountNumber` (business id such as `ACC-000001`), `status`, `message`. |
| `LinkAccountStatusResponse` | `linked`, `message`, `accountNumber` (only when linked; the record is `NON_NULL`). |
| `OrderPricingType` | enum `LIMIT`, `MARKET`. |

### Changed: order shapes
| What | Before | Now | Evidence |
|---|---|---|---|
| `PlaceOrderRequest.orderPricingType` | absent | required | `@NotNull OrderPricingType` in the record. |
| `PlaceOrderRequest.price` | required | optional; required for `LIMIT`, forbidden for `MARKET` | `@AssertTrue isPriceConsistentWithOrderType`. |
| `OrderResponse.orderPricingType` | absent | required | Field on the record. |
| `OrderResponse.price` | required number | optional, nullable | Null for `MARKET`. |
| `OrderHistoryEntry.orderPricingType` | absent | required | Field on the record. |
| `OrderHistoryEntry.price` | required number | optional, nullable | Null for `MARKET`. |
| Business rule 5 | price must be > 0 | applies to `LIMIT`; `MARKET` must omit price | Same validation. |
| `placeOrder` example | no pricing type | `orderPricingType: LIMIT` added | Keeps the example valid. |

### Changed: authorisation description
| What | Before | Now | Evidence |
|---|---|---|---|
| "Authentication" section, `PlaceOrderRequest.accountId`, "Identifiers" section | Token `accountId` claim must match the account, else `ACC-403` | Token carries the user; account must be linked to that user, else `ACC-409` | `TradeService.assertUserCanAccessAccount` throws `AccountLinkConflictException` (`ACC-409`, HTTP 409). |
| `AccountNotActive` (403) description | "or the token does not grant access to it" | "SUSPENDED or CLOSED" | 403 is now only for account status. |
| `placeOrder` 409 examples | holdings, duplicate | plus `ACC-409 not linked` | Same. |

### Changed: error catalogue (`ErrorResponse.errorCode`)
Added `ACC-409` (not linked / already has an account), `RES-404` (no such route) and `SRV-500`
(unexpected error). All three are returned by `ApiExceptionHandler` and would otherwise fail
enum-typed client code.

## October 2026: instrument names, currency and cookie sessions

### trade-api.yaml
| What | Why / evidence |
|---|---|
| `PositionResponse.instrumentName` (required), `PositionResponse.iconUrl` (nullable) | Positions showed a bare symbol. `HoldingMapper.xml` joins `instrument.instrument_name` and `icon_url`. |
| `OrderHistoryEntry.instrumentName` (required), `OrderHistoryEntry.iconUrl` (nullable) | Same for the order history. `OrderMapper.xml` joins them. JSON names are camelCase like every other field. |
| `price` / `executedPrice` / `averageCost` / `PlaceOrderRequest.price` descriptions | Stored prices are in the **account currency**. A LIMIT price is entered in the instrument's currency and converted when the order is placed (`CURRENCY.md`). No shape change. |
| `ErrorResponse.errorCode` gains `FX-503` (HTTP 503) and `POST /api/v1/orders` documents a `503` | `TradeService` cannot convert a limit price when the exchange rate service is down. `ApiExceptionHandler` maps `FxRateUnavailableException`. Frontend: `ERROR_MESSAGES` is typed on this enum, so it needed a sentence. |

The market endpoint (`GET /api/v1/market/quotes`, executor-service) is still not in a contract; it gained
`MarketQuote.currency`, `MarketQuote.iconUrl`, `MarketBoard.baseCurrency` and `MarketBoard.fxRates`, mirrored by hand in
`frontend/src/app/core/market.service.ts`.

### auth-api.yaml
| What | Why / evidence |
|---|---|
| `RefreshRequest.refreshToken` is optional; the request body is optional | A browser sends no body: the service reads the HttpOnly `refresh_token` cookie (`AuthController.presentedRefreshToken`). API clients may still send it. |
| New `POST /auth/logout` (`logout`, `204`) | Revokes the refresh token and expires both cookies; scripts cannot delete HttpOnly cookies. |
| `Set-Cookie` documented on the login, refresh and logout responses; new "Browser sessions" section | `AuthController` calls `setAuthCookies` / `clearAuthCookies`. Response bodies are unchanged. |

## Known gaps, deliberately not changed
- `LinkAccountRequest` (in the Java DTOs) has no controller endpoint, so it is not in the contract.
- The read endpoints (`GET /accounts/{id}`, `/balance`, `/positions`, `/orders`) were thought not to
  enforce the account link. They do: `TradeController` calls `assertAccess` on all four, as it does for
  `POST /orders` and `DELETE /orders/{id}`, so a foreign account returns `ACC-409`. (An earlier version of
  this note called it a security gap; it was a misreading of the controller.)
- Trade `actuator` health endpoints are not described.
- `sub` is signed as a JSON number, while RFC 7519 says a string. The contract follows the code; the
  auth and Trade teams may prefer to fix the code to emit a string, which would be a contract change.

## After any change here
```bash
cd frontend && npm run api:generate && npx ng build
```
Commit the regenerated `src/app/api/generated` in the same change.

## preferences-api.yaml (new: customer preferences module of the Trade REST API, `services/order-service`)

New contract, written before the controller. `GET` and `PUT /api/v1/accounts/{accountId}/preferences`, bearer token, the
account in the token's user compared with the path on both routes (`ACC-403` / `ACC-404`, `VAL-422` for a bad body).
`GET` always answers (defaults when nothing was saved, `updatedAt` null); `PUT` replaces the whole document. Contact
details are deliberately not part of it. Arrays are not marked `uniqueItems`, so the generator types them as arrays
rather than `Set`s that JSON would never produce. Code: `org.example.backend.preferences`.

**Currency is the account's currency.** `preferredCurrency` always equals `account.currency`; a `PUT` with another one converts the
account (balance, purchasing power, order and holding prices) in one transaction at the live rate. Added `409` (`ACC-409`, an order is
still NEW) and `503` (`FX-503`, no exchange rate) to `PUT`. Market data keeps the currency it is quoted in.

## notifications-api.yaml (new: customer notifications module of the Trade REST API, `services/order-service`)

New contract, written before the controller. `GET /api/v1/accounts/{accountId}/notifications` (search `q`, repeatable
`category`, `page`, `size`; returns the page with `unreadCount`) and `POST .../{notificationId}/read`. Bearer token, the
account's owner checked on both routes (`ACC-403` / `ACC-404`), and a notification of another account answers `NTF-404`
like one that does not exist. **There is deliberately no route that creates a notification**: handing one over is the
in-process `NotificationGateway`, so a customer's token cannot send itself anything. The inbox lists unread notifications
and ones read within the last hour. New code: `NTF-404`. Code: `org.example.backend.notifications`.

## watchlist-api.yaml: price alerts

`PUT` and `DELETE /api/v1/accounts/{a}/watchlists/{w}/items/{ticker}/alert` (tag `Price alerts`), and an `alert` object
(nullable) on every `WatchlistItem` (`direction`, `targetPrice`, `status` ACTIVE/TRIGGERED, `setAt`, `triggeredAt`,
`triggerPrice`, `delivery` PENDING/HANDED_OVER/FAILED). Both routes answer with the whole watchlist, like the others. One
alert per entry, fires once, capped per account. New codes: `ALR-404`, `ALR-409`, `ALR-422`. The contract text records what
"crossed" means and why it fires once. Existing clients are unaffected (a new nullable field and new routes).

## portfolio-api.yaml (new: Portfolio and P&L module of the Trade REST API, `services/order-service`)

Copied from the programme's `contracts/portfolio-api.yaml`; the three routes, `/health`, the definitions, the error catalogue and the
staleness rules are unchanged. New code on this platform: **`MKT-503`** (pricing unavailable for every held instrument; the other four
codes are the platform's own). Code: `org.example.backend.portfolio`.

Team additions, all marked in the file and all additive (nothing renamed, nothing newly required):

- **Price fields are in the account's base currency** (`lastPrice`, `previousClose`, `marketValue`, `unrealisedPnl`, `dayPnl`), because the
  platform stores cost basis and average cost in the account currency. `PricedPosition.currency` stays the instrument's currency.
- **Profit and loss for the day**: `dayPnl` and `dayPnlPercent` on `PortfolioSummary` and `PricedPosition`, `previousClose` on
  `PricedPosition`, `dayPnl` on `PnlResponse`. Live, from the quote's previous close; never stored.
- **Realised profit and loss without a price**: `GET /api/v1/portfolio/{accountId}/realised` (`RealisedPnlResponse`) returns only what was
  booked at sales, so it never needs a quote and is never `503 MKT-503`. A portfolio screen can still show realised profit and loss while
  pricing is down.
- **The account claim**: the token carries the authenticated user; `account.user_id` links the user to the account, and that link is what
  is compared with the path account (`403 ACC-403` on a mismatch).

## portfolio-performance-api.yaml (new: end-of-day statements and the NAV curve, `services/order-service`)

A separate team contract, so the programme's binding `portfolio-api.yaml` is left as it is. One route,
`GET /api/v1/portfolio/{accountId}/performance` (`from`, `to`, `benchmark`), owner-only like every portfolio route (`ACC-403` / `ACC-404`).
It returns the account's **closed-day** statements (value, cost basis, unrealised and cumulative realised profit and loss, the day's profit and
loss, net flow, NAV), a summary of the range and, optionally, a benchmark rebased to 1000 on the same first day. It only reads what was stored:
it never calls the market data vendor. The first time an account is asked for, its history is built in the background and the answer is
`202` `{"status": "building"}`; ask again shortly. A day is `estimated` when a price it used was synthetic, missing, filled forward over more
than a long weekend, or an exchange rate was today's. Money put in or taken out is `netFlow` and never moves the NAV.

New codes: **`PRF-503`** (the history is switched off, `portfolio.performance.enabled=false`) and, on this route, `VAL-422` for a start after
the end or a benchmark that is not configured. Additive: no existing route, field or code changed. Code: `org.example.backend.portfolio.performance`.
