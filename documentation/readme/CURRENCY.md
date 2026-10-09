# Currency handling and the ExchangeRate-API

Before this change every amount was treated as the same unit: a share quoted at INR 1,100 (INFY.NS) was compared with,
and debited from, a USD balance as if it cost 1,100 dollars. This document describes the fix and, as asked, exactly
where the ExchangeRate-API is called and why.

## The rule

> **Every stored price is in the account's currency.** `orders.price` and `holdings.purchase_price` are always in
> `account.currency`. Quotes and limit prices the *user* sees and types are in the **instrument's** currency (what the
> market board shows). The services convert between the two at the moments listed below.

Why store account currency: balances are already in it, the UI already formats positions and orders with the account
currency, and cost basis / average cost / the donut total all add up without further conversion.

Where the two currencies come from:

| Currency | Source |
|---|---|
| Account | `account.currency` (the Trade API opens accounts in `USD`; sample accounts also have EUR and GBP) |
| Instrument | The quote API's own `currency` field when it reports one; otherwise the new `instrument.currency` column (default `USD`, `INR` for `*.NS` / `*.BO` in the sample data) |

## Where the ExchangeRate-API is fetched

The API is **only ever called from the backend**, by two services, and **never when the two currencies are equal**
(a USD account buying AAPL makes zero API calls).

| # | Where | When | What for |
|---|---|---|---|
| 1 | **executor-service**, `TradeExecutorService.inAccountCurrency()` -> `CurrencyConversionService` -> `ExchangeRateApiClient` | When an `ORDER_PLACED` message is executed, after the live quote is fetched | Converts the quote (instrument currency) to the account currency **before** `FillDecisionEngine` decides, so the limit check, the funds check (`account.canAfford`), the debit/credit and the stored fill price are all in account currency. This is the fix for the INFY.NS bug |
| 2 | **order-service**, `TradeService.limitPriceInAccountCurrency()` | When a **LIMIT** order is placed | Converts the limit price the user typed (instrument currency) to the account currency before it is stored in `orders.price`, so a working order compares like with like at fill time. MARKET orders carry no price and need no rate here |
| 3 | **executor-service**, `MarketQuoteService.getBoard()` | When the market board is (re)built (cached 30 s) | Attaches the cached rates (`baseCurrency`, `fxRates`) to `GET /api/v1/market/quotes`. The browser uses them **only for estimates**: "~$11.42" under a rupee price, "Estimated cost in USD" in the order ticket, and the ticket's insufficient-cash warning. The real conversion is always the backend's (rows 1 and 2) |

If the rate service is down or the key is missing:

- row 1: the order is **REJECTED** with the new reason `FX_RATE_UNAVAILABLE` (it does not hang as NEW);
- row 2: the request fails with `503` and error code `FX-503` ("Exchange rate unavailable"); the UI shows a sentence
  suggesting a market order;
- row 3: the board still loads, just without `fxRates` (the UI then shows "Settles in USD at the live exchange rate"
  instead of a number and leaves the cash check to the executor).

## Caching (the free plan has a request quota)

`CurrencyConversionService` keeps one `latest/USD` snapshot per service and refreshes it lazily after
`trading.fx.cache-ttl-minutes` (default **180**). So the quota use is at most about 8 calls a day per service, only on
days someone trades or opens the board with a foreign-currency instrument involved. If a refresh fails the last rates
keep being used (retry after 1 minute); with no rates at all, conversion fails as above. The rate for A -> B is
`rates[B] / rates[A]` (everything is relative to USD, so INR -> EUR goes through USD).

## Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `EXCHANGE_RATE_API_KEY` | executor-service, order-service | Your ExchangeRate-API key. Empty means "no conversion available" |
| `EXCHANGE_RATE_API_URL` | executor-service, order-service | Base **without** the key, default `https://v6.exchangerate-api.com/v6`. The services request `{URL}/{KEY}/latest/USD` |

(`trading.fx.*` in each `application.properties`: `base-url`, `api-key`, `base-currency`, `cache-ttl-minutes`,
`request-timeout-millis`.) The key is part of the URL, so the services never log the URL or the HTTP client's
exception text. See `external.exchange-rate` in `config/application.example.yml`.

## Database

`instrument` gained two columns (`databases/PostgreSQL/trading/schema.sql`, `seed_data.sql`):

- `currency CHAR(3) NOT NULL DEFAULT 'USD'` - what the instrument is quoted in;
- `icon_url VARCHAR(255)` - the logo path, `/assets/icons/<TICKER>.svg` in upper case.

Existing databases: run `db/migrations/add_instrument_icon_and_currency.sql` (idempotent). The order-service also adds
the columns on start-up (`schema.sql`, `ADD COLUMN IF NOT EXISTS`), but only the migration script back-fills INR and the
icon paths.

## Things to know

- **Old data is not converted.** Orders and holdings written before this change hold whatever number was stored then
  (e.g. an INFY.NS buy recorded as 1,100 "dollars"). Nothing rewrites them. For a demo database, reload
  `trading/seed_data.sql` or place fresh orders.
- **Sample data** has EUR and GBP accounts with USD instruments. Those accounts now convert on every trade and need a
  working key.
- **Rounding:** converted prices are rounded to 4 decimals (the column scale), fills to 2 decimals as before, and a
  price that would round to zero is stored as 0.0001.
- **Frontend estimate vs backend fill** can differ slightly (the board's rate is up to 3 hours old on each side, and
  prices move). The estimate is labelled approximate (`~`).

## Other places a currency could matter (not changed, for your decision)

1. **Opening an account** always creates a `USD` account (`TradeService.createAccountForAuth`). There is no way yet to
   pick a base currency at sign-up; adding one is a `CreateAccountRequest` field plus a dropdown.
2. **Pre-trade funds check at placement.** `placeOrder` does not check cash at all today (the check is at fill, in the
   executor). If you want the instant `ORD-400` the contract describes, the order-service has everything needed (account
   currency, instrument currency, rates) to do it.
3. **Market data Kafka messages** (`market-data` topic) carry prices in the instrument currency with no currency field.
   Any consumer that sums across instruments should convert.
4. **ETL / analytics** (`etl/`) read `orders.price` and `holdings.purchase_price`, which are account-currency, mixed
   across accounts. Aggregating across accounts needs a conversion (or a currency column in `fact_trades`).
5. **Dashboard totals** are fine: they sum account-currency numbers of one account.

## The account currency is fixed at opening

The currency is a property of the account, **chosen once during account setup and read-only afterwards**. That keeps everything stored
"in the account currency" (orders, holdings, balances, cost basis, the rule above) stable for the life of the account. It used to be
a Settings preference that converted the whole account at the day's rate; it was removed because it rewrote real money values at whatever
the rate was, did not round-trip, and needed special handling (open orders, missing rates, a confirmation dialog).

- `POST /api/v1/accounts/create` takes an optional `currency` (one of `USD, EUR, GBP, INR, JPY, CAD, AUD, CHF, SGD, CNY`, default `USD`) and
  returns it. An unsupported code is a `422`.
- The **opening balance minimum depends on the currency**, from a table in configuration, not from an exchange rate:
  `account.opening.minimum.<CODE>` (defaults: USD 20,000, EUR 18,000, GBP 16,000, INR 1,600,000, JPY 3,000,000, CAD 27,000, AUD 30,000,
  CHF 17,000, SGD 27,000, CNY 145,000). No rate call happens at account creation.
- `PUT /api/v1/accounts/{id}/preferences` may omit `preferredCurrency` or repeat the account's; any other value is `409 CUR-409` and nothing
  is saved. `GET` always returns the account's currency.
- Settings shows it as a read-only fact ("Account currency: EUR. Set when your account was opened."). No dropdown, no confirmation dialog.
- Existing accounts keep whatever currency they have (the sample data has EUR and GBP accounts on purpose).
- `CurrencyConversionService` stays: it converts an instrument's quote currency to the account currency when an order is placed, and
  prices the portfolio.
