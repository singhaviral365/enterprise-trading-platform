# API clients

Typed Angular clients for the two platform contracts, **generated** from
[`documentation/contracts/`](../../../../documentation/contracts). Do not hand-write HTTP calls to these services.

| Contract | Output | Base URL |
|---|---|---|
| `documentation/contracts/auth-api.yaml` | `generated/auth` | `http://localhost:3000` |
| `documentation/contracts/trade-api.yaml` | `generated/trade` | `http://localhost:8080` |

## Regenerate

Requires Node and **Java 11+** (the generator is a JAR that npm downloads on first use).

```bash
cd frontend
npm ci
npm run api:generate     # wipes src/app/api/generated, then regenerates both contracts
npm run api:check        # regenerates and fails if the committed output differs (use in CI / before a PR)
```

Run `npm run api:generate` and commit the result **every time a contract changes**.

## Configuration and pinning

Everything lives in [`frontend/openapitools.json`](../../../openapitools.json): one entry per contract
(`auth-api`, `trade-api`), each writing into its own subdirectory of `generated/`.

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
- Base URLs are wired in `api.config.ts` (`provideApiClients()` in `app.config.ts`). The existing auth interceptor
  attaches the bearer token to these requests.

## Usage

```ts
private readonly trade = inject(TradeApi);
this.trade.balance(accountId).subscribe((b) => ...);   // typed BalanceResponse
```

If a contract renames or removes a field, regenerating makes every use of it fail `ng build` instead of returning `undefined` at runtime.
