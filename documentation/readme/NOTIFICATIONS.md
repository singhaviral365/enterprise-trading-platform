# Customer notifications and watchlist price alerts

What a customer is told, how, and where it can and cannot run. Three things are built (in-app inbox, watchlist price
alerts, development-only email) and one is planned (SMS, at the end).

| Part | State |
|---|---|
| In-app notifications (the bell) | Built |
| Watchlist price alerts | Built |
| Email: MailHog in `dev`, a real provider in `prod` (see [EMAIL.md](EMAIL.md)) | Built |
| SMS | **Plan only**, see [SMS plan](#sms-plan-not-built) |

Contracts (written before the code): [`contracts/notifications-api.yaml`](../../contracts/notifications-api.yaml) and
[`contracts/watchlist-api.yaml`](../../contracts/watchlist-api.yaml). Backend module READMEs:
[`notifications/`](../../services/order-service/src/main/java/org/example/backend/notifications/README.md) and
[`watchlist/`](../../services/order-service/src/main/java/org/example/backend/watchlist/README.md).

## How the pieces fit

```
executor-service ──ORDER_FILLED / REJECTED / CANCELLED──► Kafka `trade-events`
                                                              │ group `customer-notifications`
                                                              ▼
                                           TradeEventsConsumer ──┐
                                                                 │  NotificationGateway.deliver(...)   (a Java interface,
executor-service ──QUOTE──► Kafka `market-data`                  │   in-process, NOT an HTTP route)
        │ group `watchlist-prices`                               ▼
        ▼                                              NotificationRecorder
MarketDataQuoteConsumer ─► LatestQuoteStore              1. resolve channels from Customer Preferences (every send)
        └─► PriceAlertEvaluator ─► PriceAlertFiring ──►  2. insert the notification (unique event key = idempotent)
              (hash lookup by symbol)                    3. IN_APP: the row is the delivery
                                                         4. EMAIL / SMS: a delivery row (QUEUED or SKIPPED + reason)
                                                              │
                                    ┌─────────────────────────┴───────────────────────┐
                                    ▼                                                 ▼
                          Angular bell / inbox                              EmailDispatcher (scheduled)
                  GET /accounts/{id}/notifications                         QUEUED ─► MailHog (dev only)
                  POST .../{id}/read
```

The Kafka offset says what was **read**. The delivery state says what **reached** a customer. They are separate on
purpose: the listener returns, and the offset is committed, as soon as the notification is durably recorded. A mail
server having a bad afternoon cannot stall a partition and back up every other account on it.

## In-app notifications

**What the customer sees.** A bell at the foot of the sidebar with an unread badge (capped at `99+`). Clicking it opens a
scrollable card with:

- a **search** box (case-insensitive substring over title and message; `%` and `_` are literal; debounced 300 ms)
- a **category** filter (Order updates, Watchlist alerts, Strategy executions)
- a **status** filter (Unread, Read; **Unread only by default**, never empty) and a **date range** (From / To, with Today,
  Last 7 days and Last 30 days presets) on the notification's created time, whole days in the user's time zone, at most 366 days
- a **reset** button that returns to: no search, no category, Unread, any date
- **pagination** with a page-size selector (5, 10, 25), newest first

The API behind it (`GET /accounts/{id}/notifications`) takes `status` (repeatable), `from` and `to` as well as `q` and
`category`. **Without `status`** the list is the original one (unread plus read within the last hour); **with `status`** the
one-hour retention no longer applies, so `READ` returns every read notification. `unreadCount` is always the account's total,
so the bell never changes with the page's filters.

Nothing is deleted: a read notification stays in the database with its `read_at`.

**Where it comes from.** Order outcomes from `trade-events` (filled, rejected, cancelled) and fired price alerts handed
over by the watchlist module. Rejections are as newsworthy as fills and say why, in words from a fixed list (an unknown
reason is never echoed back).

**Which channel.** Read from Customer Preferences **on every send**, never a constant, and written onto the
notification (`channels`). A customer who chose "No notifications", or whose preferences do not want that category, still
gets a row with `NONE` (so the decision is visible) but it does not appear in the bell. The bell lists only
notifications routed to `IN_APP`.

**Replays.** The notification is keyed by the Kafka `eventId`. A second delivery of the same event inserts nothing and
creates no delivery rows.

**Access.** Every route checks that the token's user owns the account in the path (`ACC-403`/`ACC-404`), and every query
is scoped to that account in the SQL itself. A notification id belonging to someone else is `NTF-404`, the same answer as
an id that does not exist. There is **no route that creates a notification**.

| Route | Purpose |
|---|---|
| `GET /api/v1/accounts/{accountId}/notifications?q=&category=&page=&size=` | The inbox page, with `unreadCount` for the badge |
| `POST /api/v1/accounts/{accountId}/notifications/{notificationId}/read` | Mark read (idempotent) |

The sidebar bell is refreshed every 30 seconds (one small request) so a new fill or a fired alert shows up without a reload.

## Watchlist price alerts

Set from the **Alert** column of the dashboard watchlist. One alert per watchlist entry: a direction (`ABOVE` or `BELOW`,
never both) and a target price.

**What "crossed" means.** `ABOVE` fires on the first quote at or over the target, `BELOW` on the first at or under it.
Setting an alert whose target the latest known price has already reached is refused (`ALR-409`, and the form says so
before you try), so an alert never fires the moment it is created. If no price is known yet the alert is accepted.

**What happens next: it fires once.** The alert becomes `TRIGGERED`, keeps the price that crossed it, and stays visible.
It does not fire again on later quotes; setting a new alert on the entry re-arms it. *Why:* firing on every quote past the
level sends a customer dozens of messages a minute, through a module somebody else owns. *Alternatives considered:* wait
for a manual reset (more states and a button for the same result as setting a new alert), or re-arm automatically when the
price moves back (a chatty alert near its level).

**How it is evaluated.** Every quote for every symbol passes through `PriceAlertEvaluator`. The first thing it does is a
hash lookup by symbol in an in-memory index of ACTIVE alerts, so a symbol nobody watches costs one lookup and no
database call. The index is loaded at start-up from the partial index `idx_watchlist_item_active_alert` and kept in step by
the set/clear routes after they commit. Only a quote that moved the price store forward is evaluated, so a replayed or
out-of-order quote cannot fire anything.

**How it is delivered.** Firing is one guarded `UPDATE ... WHERE alert_status = 'ACTIVE' AND direction = ? AND target = ?`.
Only the call that changes the row hands the alert to notifications, in-process. This module never resolves a channel.

**When the hand-over raises** (the database is unavailable, the account has gone): the alert is already `TRIGGERED` and is
not fired again; its `delivery` becomes `FAILED`, which the customer sees on the row ("Delivery failed"). A scheduled job
retries it up to `watchlist.alerts.max-delivery-attempts` (3) times. The retry is safe: the notification is keyed by the
alert, so a hand-over that did succeed but whose result was lost is a no-op the second time. Past the attempts it stays
`FAILED`, visible, never retried forever and never silent.

**Cap.** An account may hold `watchlist.limits.max-alerts-per-account` (20) ACTIVE alerts, `ALR-422` beyond that. The count
and the write are one statement under a per-account advisory lock, so racing requests cannot slip past it. The UI disables
Set alert at the cap.

| Route | Purpose |
|---|---|
| `PUT /api/v1/accounts/{a}/watchlists/{w}/items/{ticker}/alert` | Set or replace the alert; returns the watchlist |
| `DELETE /api/v1/accounts/{a}/watchlists/{w}/items/{ticker}/alert` | Clear it; returns the watchlist |

**Prices are still not stored.** The alert stores the customer's own threshold (`alert_target_price`) and the one quote
that crossed it (`alert_trigger_price`, written once at firing). No quote feed, no latest-price column. The existing guard
test `WatchlistPricesAreNotStoredTest` was made explicit about those two names; anything else price-like still fails it.

## Email (development only)

Built, and decoupled so it can only run on a developer's machine.

**To try it.**

```bash
# 1. start MailHog (a local SMTP catcher) on your machine, then the order-service with the dev profile
.\run-app.ps1 --windows --mail
#    or by hand:
cd services/order-service && mvn spring-boot:run -Dspring-boot.run.profiles=dev

# 2. read the mail at http://localhost:8025
```

**From IntelliJ.** The repository ships a shared run configuration in `.run/` (they appear in the run-configuration
drop-down by themselves): **OrderService (dev + MailHog)** is the Spring Boot application with the active profile `dev`; MailHog
must already be running on your machine. Press Run; read the mail at http://localhost:8025. It needs the same environment
variables as your normal order-service run (`DB_PASSWORD`, `JWT_SECRET`, `JWT_ISSUER`, `KAFKA_BOOTSTRAP_SERVERS`, ...): if you
supply them through an EnvFile or the configuration's *Environment variables*, edit **OrderService (dev + MailHog)** and add the
same. Without the plugin or the shared configs: duplicate your usual run configuration, set *Active profiles* to `dev`, and start
MailHog once from a terminal with the `docker compose` line above.

In Settings, switch **Email** on. Place an order, or let a price alert fire, and the message appears in MailHog. Sender
is `noreply@etpteamriya.com`; the recipient is the email held for the account.

**Where the address comes from.** The login's email lives in the Auth service's own database, which the Trade API cannot
read, so the account row keeps its own copy: account set-up (`POST /api/v1/accounts/create`) already asks for an email and a
phone number, and the Trade API now stores both on the new account (`account.email`, `account.phone_no`), in the same
transaction as the account itself. The UI pre-fills the email with the registered one. **Accounts opened before this
change have no address on file**, so their email deliveries are recorded as `SKIPPED` ("No email address on file"); in
development you can add one:

```sql
UPDATE account SET email = 'alice@example.com', phone_no = '+353 1 555 0100' WHERE account_id = 1001;
```

**How it is kept dev-only.** Four independent layers, so a mistake in one does not send mail from production:

| Layer | What it does |
|---|---|
| Off by default | `notifications.email.enabled=false` in `application.properties`. Only `application-dev.properties` turns it on |
| Different bean | When off, `DisabledEmailSender` is wired and email deliveries are recorded `SKIPPED` with the reason. `SmtpEmailSender` is not even created |
| Start-up guard | `DevOnlyEmailGuard` stops the application if email is enabled without a `dev`/`local` profile, alongside a `prod`/`production`/`staging` profile, or with an SMTP host other than `localhost`/`127.0.0.1`/`::1`/`mailhog` |
| Compose | MailHog is not in `docker-compose.yml`; run it on your machine |

To switch it off in any environment: do nothing. To switch it off in a dev environment: unset the profile or set
`notifications.email.enabled=false`.

**Delivery tracking.** `notification_delivery` has one row per non-in-app channel: `QUEUED` (recorded), `SENT` (accepted),
`FAILED` (attempts exhausted, default 3) or `SKIPPED` (switched off, no address, or channel not provisioned). The
`EmailDispatcher` sweeps `QUEUED` rows every 5 seconds with `FOR UPDATE SKIP LOCKED`, off the Kafka thread. Message
bodies are plain text, carry no link, and the subject is forced onto one line so a header cannot be injected.

**No customer-controlled destination.** There is no field a customer can set that the platform then posts to: the
recipient is the stored address and the SMTP server comes from configuration. That is what keeps this free of
server-side request forgery.

## SMS plan (not built)

Not implemented. The routing already treats SMS as a real channel: a customer who chooses SMS in Settings gets a
`notification_delivery` row for `SMS` with status `SKIPPED` and the reason "SMS channel is not provisioned", so nothing is
lost and the decision is recorded. This is what it would take to make it send, in development only, the same way email is.

### Options considered

| Option | Verdict |
|---|---|
| **Twilio with test credentials** | Test credentials validate requests but send nothing, and show nothing to read. Real credentials send real SMS to real handsets and cost money. Not a safe dev default |
| **A self-hosted mock of an SMS API** (recommended) | Nothing leaves the machine, and you can read what was "sent". The simplest way is [WireMock](https://wiremock.org/) in a container, stubbing a Twilio-shaped `POST /2010-04-01/Accounts/{sid}/Messages.json` and using its request journal (`/__admin/requests`) as the inbox. The client code is then identical to the real provider; only the base URL differs |
| A tiny custom "sms-sink" service | Same idea, ~60 lines, but one more thing to own. Reasonable if WireMock feels heavy |
| Keep logging only | What the `SKIPPED` row is today. Fine until someone needs to see the message |

### Design (mirror of email)

1. **Interface and two beans.** `SmsSender { enabled(); send(to, body) }`, with `DisabledSmsSender` (default) and
   `MockSmsSender` (posts to the mock). Config: `notifications.sms.enabled=false`, `notifications.sms.base-url`.
2. **Same four dev-only layers.** Off by default; separate bean; `DevOnlySmsGuard` (profile `dev`/`local`, host
   allow-list `localhost`/`wiremock`); compose service in its own `dev-sms` profile. A real provider would be a different
   bean behind an explicit setting and a secrets manager, and is not part of this plan.
3. **A phone number to send to.** Already stored: account set-up saves `phone_no` on the account row, next to the
   email. What is left is to normalise it to E.164 (`^\+[1-9]\d{6,14}$`) when sending (the stored form allows spaces and
   brackets), and to treat a number that cannot be normalised as `SKIPPED` ("No usable phone number"). Accounts without
   one: `SKIPPED` ("No phone number on file"), as for email.
4. **Generalise the dispatcher.** `EmailDispatcher` becomes a channel-aware sweeper (or a sibling `SmsDispatcher` sharing
   the same `selectQueued` query with a channel parameter). `NotificationRecorder.routeSms` mirrors `routeEmail`:
   `SKIPPED` if disabled, `SKIPPED` if no number, else `QUEUED`.
5. **Message shape.** One 160-character GSM-7 line (title and a shortened message), no link, nothing the event contract
   prohibits.
6. **Cost and abuse controls.** SMS costs money and a price alert can fire often, so add a per-account daily cap (for
   example 10) checked at routing time, recorded as `SKIPPED` ("SMS daily limit reached"), plus the existing once-per-alert
   rule.
7. **Consent.** Choosing SMS in Settings is the opt-in. Before real use, verify the number (a one-time code) so nobody can
   enrol someone else's phone, and honour STOP.

### Work and acceptance

About two days: interface and guard (0.5), contact capture and migration (0.5), dispatcher and routing (0.5), compose and
docs (0.25), tests (0.5). Done when: SMS chosen in Settings and a fill produces a readable message in the mock; the same
config with no `dev` profile refuses to start; a replayed event sends nothing twice; a missing number is `SKIPPED` not
`FAILED`; the daily cap holds.

**Open questions:** do we need number verification before the first real provider (yes, for production, not for the mock);
which regions we send to (affects sender registration and opt-out rules); whether SMS should carry only high-signal events
(rejections and fired alerts) and not every fill.

## Configuration

| Property (order-service) | Default | Meaning |
|---|---|---|
| `notifications.kafka.trade-events-topic` | `trade-events` | Topic read |
| `notifications.kafka.consumer-group` | `customer-notifications` | This module's own group |
| `notifications.kafka.consumer.enabled` | `true` | Start the consumer |
| `notifications.kafka.consumer.start-from` | `latest` | Where a brand-new group starts. `latest` so last month's fills are not announced; after its first start it resumes from committed offsets |
| `notifications.inbox.read-retention-minutes` | `60` | How long a read notification stays listed when the caller sends no `status` filter |
| `notifications.email.enabled` | `false` | Development only; the dev profile sets it |
| `notifications.email.from` | `noreply@etpteamriya.com` | Sender |
| `notifications.email.smtp.host` / `.port` | `localhost` / `1025` | MailHog. Must be a local host |
| `notifications.email.dispatch.*` | 5 s, batch 20, 3 attempts | The sweeper |
| `watchlist.limits.max-alerts-per-account` | `20` | Cap on ACTIVE alerts |
| `watchlist.alerts.redelivery-interval-millis` | `60000` | Retry sweep |
| `watchlist.alerts.max-delivery-attempts` | `3` | Hand-over attempts per fired alert |

Compose passes `BACKEND_SPRING_PROFILES_ACTIVE` and `NOTIFICATIONS_EMAIL_SMTP_HOST` through to the containerised backend;
leave them unset and email stays off.

## Known limits

- **One order-service instance.** The quote store and the alert index are per instance (as the watchlist README already
  says). Two instances in one consumer group would each see only some symbols. The guarded `UPDATE` still stops an alert
  firing twice.
- **Cancelled orders.** The inbox handles `ORDER_CANCELLED`, but the executor does not publish it yet (cancelling goes
  through the Trade API, which does not emit an event), so a cancel produces no notification until it does.
- **Old accounts have no email address** (see above).
- **The SQL has been checked by unit and XML tests, not run against PostgreSQL here** (the Testcontainers tests need
  Docker). Run `./mvnw test` on a machine with Docker, and start the service once against a real database, before
  relying on the new statements.
- The shared exception handler answers an unsupported HTTP method with a 5xx rather than 405 (existing behaviour).
