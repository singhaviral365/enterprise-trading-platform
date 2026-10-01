# End-to-end journeys (Playwright)

These specs drive a real browser against the **running stack**. They mock nothing and start nothing.

## Journeys

| Spec | Covers |
| --- | --- |
| `sign-in.spec.ts` | Guard redirect, refused sign-in, successful sign-in, arriving at the page you asked for |
| `place-order.spec.ts` | Non-active (read-only) account, rejection before submission, a placed order (NEW, FILLED or REJECTED accepted) |
| `blotter.spec.ts` | Order history: guard, rows, sorting, refresh (bonus) |

Isolation: each spec file runs in its own worker process, each test in a fresh browser context, and there is
no shared module state. No test expects an order, token or session left by another.

## Configuration (environment variables)

| Name | Meaning |
| --- | --- |
| `E2E_BASE_URL` | Address of the running Angular app, e.g. `http://localhost:4200` |
| `E2E_USERNAME` / `E2E_PASSWORD` | User with a linked, **active** account and cash for one share |
| `E2E_READONLY_USERNAME` / `E2E_READONLY_PASSWORD` | User whose linked account is SUSPENDED or CLOSED |
| `E2E_SYMBOL` | A symbol on the market board with a live price |

Copy `.env.e2e.example` to `.env.e2e` (git-ignored) and fill it in, or export the variables (CI).

## Run

Start the stack first: auth service (3000), order service (8081), executor (8082), then `npm start`.

```bash
npm install
npx playwright install chromium
npm run e2e
```

`npm run e2e:ui` opens the Playwright UI; `npm run e2e:report` shows the last HTML report.

The placed-order test buys one share, so it spends real (test) cash and creates a real order each run.
