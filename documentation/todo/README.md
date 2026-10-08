# To do

Plans and open work. Each file is self-contained.

| # | File | What | State |
|---|---|---|---|
| 01 | [01-real-email.md](01-real-email.md) | Off by default, MailHog in `dev`, a real provider in `prod` (auth-service and order-service). MailHog already removed from `docker-compose.yml` | Plan |
| 02 | [02-payload-encryption.md](02-payload-encryption.md) | JWE envelope encryption of request and response bodies between the frontend and the services | Plan, decisions D1-D5 open |
| 03 | [03-npm-vulnerabilities.md](03-npm-vulnerabilities.md) | auth-service `package.json` overrides and upgrades for `npm-audit.json` | Edited, waiting for your `npm install` |
| 04 | [04-ui-profile-menu.md](04-ui-profile-menu.md) | One profile icon and one pane for user and account details | Plan |
| 05 | [05-ui-portfolio-split-view.md](05-ui-portfolio-split-view.md) | Compact instrument-only list, quote detail in the middle, assistant chat (split out of the signal card) on the right; Market data and Portfolio | Plan, decisions confirmed |
| 06 | [06-ui-settings-layout.md](06-ui-settings-layout.md) | Settings as two cards per row, compact spacing | Plan |
| 07 | [07-ui-notifications-page.md](07-ui-notifications-page.md) | Wider notifications page with Status and date-range filters and a reset button (needs an API change) | Plan |
| 08 | [08-ui-minus-and-dash-glyphs.md](08-ui-minus-and-dash-glyphs.md) | Replace `fa-minus` and the long dash placeholders with a small hyphen (inventory of every place) | Plan |
| 09 | [09-db-connection-pool-and-sql-logging.md](09-db-connection-pool-and-sql-logging.md) | Hikari is unconfigured (Boot defaults); the pasted log is MyBatis DEBUG noise, not an error; pool settings, sizing and log clean-up | Plan |
| 10 | [10-strategy-limits-and-form.md](10-strategy-limits-and-form.md) | Keep the safety limits but derive them; five-field strategy form with a live summary sentence | Plan, needs your check of the story wording |
| 11 | [11-feature-ideas.md](11-feature-ideas.md) | Ten additive feature ideas that fit the existing services, with a ranked shortlist | Ideas |
| 12 | [12-currency-set-once-at-account-opening.md](12-currency-set-once-at-account-opening.md) | Currency chosen once at account setup, read-only afterwards (no more converting the account from Settings) | Plan |
| 13 | [13-portfolio-visuals-and-page-structure.md](13-portfolio-visuals-and-page-structure.md) | Eleven candidate charts (candlestick, treemap, drawdown, stacked value ...) and Portfolio split into Overview / Holdings / Performance / P&L | Plan |
| 14 | [14-ui-code-entry-boxes.md](14-ui-code-entry-boxes.md) | The 6-digit code as six boxes (one real input, six drawn boxes) | Plan |
| 15 | [15-colour-system-options.md](15-colour-system-options.md) | Three complete colour systems to replace the green primary (Sapphire, Ultraviolet, Graphite and Brass), with a live-preview approach | Proposal |
| 16 | [16-account-assistant-chatbot.md](16-account-assistant-chatbot.md) | A second chatbot that knows your account (orders, P&L, strategies), answers with links to the exact filtered screen | Plan |
| 17 | [17-logging-and-error-handling.md](17-logging-and-error-handling.md) | JSON logs, an `ActionLog` wrapper, redaction, trace correlation (Datadog/OTel), every exception handled once; order-service and executor-service | Plan |

Flow explanations (what a feature does for the customer) are not to do items; they live in [`../flows`](../flows).
