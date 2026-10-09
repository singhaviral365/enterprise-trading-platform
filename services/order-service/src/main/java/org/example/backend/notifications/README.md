# Customer notifications module

Turns what happens (an order fills or is rejected, a price alert fires) into a message the customer actually receives,
on the channel they chose. The customer-facing half is an inbox; the platform-facing half is a Java interface other modules
call. Design, behaviour and the SMS plan are in
[`documentation/readme/NOTIFICATIONS.md`](../../../../../../../../../documentation/readme/NOTIFICATIONS.md). Contract:
[`contracts/notifications-api.yaml`](../../../../../../../../../contracts/notifications-api.yaml).

## Packages

| Package | Holds |
|---|---|
| `gateway` | `NotificationGateway` (the in-process door other modules use), `NotificationRequest`, `GatewayResult`. **Not an HTTP route** |
| `service` | `NotificationRecorder` (resolve channels, record, route), `NotificationInboxService` (the owner-checked reads) |
| `consumer` | `TradeEventsConsumer` (group `customer-notifications`, topic `trade-events` only), `OrderOutcomeMessages` |
| `controller`, `dto` | The two inbox routes and their error mapping (`NotificationExceptionHandler`) |
| `mapper`, `model` | MyBatis (`resources/mapper/NotificationMapper.xml`), `Notification`, `NewNotification`, `DeliveryStatus`, `QueuedEmail` |
| `email` | `EmailSender` and its two beans, `DevOnlyEmailGuard`, `EmailDispatcher` |
| `config` | Kafka wiring for this module and the mapper scan |
| `exceptions` | `NTF-404`, `ACC-403`, and the poison-message type |

Nothing outside the package imports anything inside it except `gateway` (the watchlist module calls
`NotificationGateway`).

## Tables (`notifications-schema.sql`, idempotent, loaded at start-up)

| Table | Holds |
|---|---|
| `notification` | One row per event. `event_key` is UNIQUE: that is the idempotency. Carries the resolved `channels` and `in_app` |
| `notification_delivery` | One row per non-in-app channel: `QUEUED`, `SENT`, `FAILED`, `SKIPPED`, attempts, a short reason |

The address for channels that need one is not here: it is `account.email` (and `account.phone_no` for SMS), saved when the
account is set up, because the Auth service's database is out of the Trade API's reach.

For a database created before this module: `databases/PostgreSQL/migrations/add_notifications_and_price_alerts.sql`.

## Rules this module keeps

- **The channel is resolved on every send**, through `PreferenceResolver`, and recorded on the notification.
- **Commit the offset once the notification is durably recorded**, not once a provider confirms. The consumer returns after
  `deliver` commits; the dispatcher sends later, on its own thread.
- **Idempotent on the event key.** A replay inserts nothing and creates no delivery.
- **Every inbox query is scoped to the account in the SQL**, and the account is checked against the token's user first.
- **No caller-supplied destination.** `NotificationRequest` has no channel, address or URL. Email goes to the stored
  address through a server from configuration.
- **Poison messages are dead-lettered at once** (`trade-events.DLT`); an event for an account that does not exist is too.

## Tests

`./mvnw test -Dtest='org.example.backend.notifications.**.*Test'` in `services/order-service`. They cover routing and
preference changes, replay, opt-out, the consumer's message building and poison handling, the owner checks, the email
guard and dispatcher, and the SQL's safety properties (the statements themselves are not run here: they need PostgreSQL).
