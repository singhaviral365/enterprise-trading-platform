# API clients

Typed Angular clients for the two platform contracts, **generated** from
[`documentation/contracts/`](../../../../documentation/contracts). Do not hand-write HTTP calls to these services.

| Contract | Output | Base URL |
|---|---|---|
| `contracts/auth-api.yaml` | `generated/auth` | `http://localhost:3000` |
| `contracts/trade-api.yaml` | `generated/trade` | same origin (`''`), proxied to the order-service by `ng serve` |
| `contracts/watchlist-api.yaml` | `generated/watchlist` | same origin as the Trade API (it is a module of the same service) |
| `contracts/notifications-api.yaml` | `generated/notifications` | same origin as the Trade API |
| `contracts/preferences-api.yaml` | `generated/preferences` | same origin as the Trade API (a module of the same service) |

## Regenerate

Requires Node and **Java 11+** (the generator is a JAR that npm downloads on first use).

```bash
cd frontend
npm ci
npm run api:generate     # wipes src/app/api/generated, then regenerates every contract
npm run api:check        # regenerates and fails if the committed output differs (use in CI / before a PR)
```

Run `npm run api:generate` and commit the result **every time a contract changes**.

## Configuration and pinning

Everything lives in [`frontend/openapitools.json`](../../../openapitools.json): one entry per contract
(`auth-api`, `trade-api`, `watchlist-api`, `preferences-api`, `notifications-api`), each writing into its own subdirectory of `generated/`.

- Generator: `@openapitools/openapi-generator-cli` pinned **exactly** to `2.41.0` in `package.json`, and the
  generator JAR pinned to **7.25.0** in `openapitools.json` (`generator-cli.version`). Change both deliberately, together.
- `skipValidateSpec: true`: the validator reports one error on both contracts, `info.license.identifier is missing`.
  That is a false positive: OpenAPI 3.1 requires only `license.name`, and the contracts are not ours to edit.
  Switch it back on if the validator is fixed or a contract gains a real problem you want caught.
- `withInterfaces: true`: the 7.25.0 templates import `*.serviceInterface` unconditionally, so this must stay on.
- The `globalProperty` whitelist stops the generator from also writing its publishing boilerplate
  (`git_push.sh`, nested `README.md` / `.gitignore`). It is a whitelist, so if a generator bump adds a
  required supporting file, compilation fails with "Cannot find module": add that file name to the list.

## Rules

- The `generated/` tree is **committed** (see `frontend/.gitignore`), and nothing in it is edited by hand.
  A hand edit is overwritten on the next run and `api:check` will flag it.
- If a generated shape is awkward, wrap it outside the tree. See `auth-api.service.ts` and `trade-api.service.ts`.
- The generated packages export same-named symbols (`Configuration`, `BASE_PATH`, `provideApi`), so import from
  `./generated/auth` or `./generated/trade` explicitly, never from a shared barrel.
- Base URLs are wired in `api.config.ts` (`provideApiClients()` in `app.config.ts`). The Trade base URL is empty so
  calls stay same-origin and `ng serve` proxies `/api` to the order-service (it has no CORS); the Auth service
  enables CORS for `localhost:4200` and is called directly.
- `core/interceptors/auth.interceptor.ts` is the only place the bearer token is attached. Its allow-list is built from
  the same base URLs, so changing a base URL in `api.config.ts` updates it too.
- **Every API call in the UI goes through these clients** (`AuthApi`, `TradeApi`). Do not add `HttpClient` calls for
  them. The one exception is market data (`core/market.service.ts`): the trade-executor has no contract yet.
  When it gets one, add it to `contracts/`, regenerate, and delete the hand-written service.
- Failures reach callers as the client's `HttpErrorResponse`. Turn them into a sentence with `describeError`
  (`core/errors`), passing `byStatus` for screen-specific wording (see `LOGIN_ERRORS`).
- Compare against the generated enums (`OrderSide.Buy`, `OrderPricingType.Limit`, `AccountStatus.Active`), never
  string literals. In a template, expose the enum as a protected field first.

## Usage

```ts
private readonly trade = inject(TradeApi);
this.trade.balance(accountId).subscribe((b) => ...);   // typed BalanceResponse
```

If a contract renames or removes a field, regenerating makes every use of it fail `ng build` instead of returning `undefined` at runtime.
