# Email: off, dev, prod

Both services that send email (auth-service: codes and security notices; order-service: notification emails) share one model.
The executor-service sends none.

| Mode | Purpose | Auth-service | Order-service |
|---|---|---|---|
| **off** (default) | Nothing is sent | `AUTH_EMAIL_MODE=off` | no `dev`/`prod` profile (`notifications.email.enabled=false`) |
| **dev** | See mail locally (MailHog), nothing leaves the machine | `AUTH_EMAIL_MODE=dev` | profile `dev` (turns email on, MailHog on localhost:1025) |
| **prod** | Deliver to real addresses through a provider | `AUTH_EMAIL_MODE=prod` | profile `prod` (turns email on) |

`AUTH_EMAIL_ENABLED=true` still works as an alias for `AUTH_EMAIL_MODE=dev` for one release; the service logs a line saying so.

## What each mode enforces at start-up

The services **refuse to start** when the settings and the mode disagree, and the message names the variable to change. A
password is never printed.

* **dev**: the SMTP host must be `localhost`, `127.0.0.1`, `::1`, `mailhog` or `host.docker.internal` (the Windows host seen from a
  container). Refused when `NODE_ENV` (auth) or a `prod`/`production`/`staging` profile (order) is active.
* **prod**: the host must not be local; TLS must be `starttls` (port 587) or `implicit` (port 465); a user and password are
  required; `FROM` must be on one of the `FROM_DOMAINS`. The server certificate and host name are always verified and only TLS 1.2+
  is spoken: there is no setting to relax that.
* **staging** (order-service profile) or auth `prod` with a `NODE_ENV` other than `production`: as prod, and the recipient
  allow-list is required, so a test deployment cannot mail real customers.

## Settings

| Auth-service | Order-service | Default | Meaning |
|---|---|---|---|
| `AUTH_EMAIL_MODE` | Spring profile | off | the mode |
| `AUTH_EMAIL_SMTP_HOST` / `_PORT` | `NOTIFICATIONS_EMAIL_SMTP_HOST` / `_PORT` | localhost / 1025 (dev), 587 (prod) | the SMTP server |
| `AUTH_EMAIL_SMTP_TLS` | `NOTIFICATIONS_EMAIL_SMTP_TLS` | none (dev), starttls (prod) | `starttls`, `implicit`, `none` |
| `AUTH_EMAIL_SMTP_USER` / `_PASSWORD` | `NOTIFICATIONS_EMAIL_SMTP_USERNAME` / `_PASSWORD` | none | credentials, **environment only**, never in a file in git |
| `AUTH_EMAIL_FROM` | `NOTIFICATIONS_EMAIL_FROM` | noreply@etpteamriya.com | the sender |
| `AUTH_EMAIL_FROM_DOMAINS` | `NOTIFICATIONS_EMAIL_FROM_DOMAINS` | none | domains `FROM` may be on (required in prod) |
| `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS` | `NOTIFICATIONS_EMAIL_ALLOWED_RECIPIENT_DOMAINS` | none | only these recipient domains get mail |
| `AUTH_EMAIL_REPLY_TO` | `NOTIFICATIONS_EMAIL_REPLY_TO` | none | optional Reply-To |
| (auth: built in) | `NOTIFICATIONS_EMAIL_DISPATCH_MAX_PER_MINUTE` | 0 (prod profile: 60) | send cap per minute, to stay under a provider quota |

## Failure handling

* **Order-service**: a *permanent* refusal (a 5xx answer for the address, or an unparsable address) marks the delivery `FAILED` at once with
  "The mail server refused the address". A *transient* one (4xx, timeout, connection refused, a login that needs fixing) stays
  `QUEUED` until `max-attempts`. An address off the allow-list is `SKIPPED` with `RECIPIENT_NOT_ALLOWED`. Nothing is retried that cannot help, and
  nothing logs an address.
* **Auth-service**: a send that fails surfaces to the caller as the usual "could not send" error; codes are not logged.
* Header injection is prevented by flattening the subject to one line.

## Start here: send from a personal Gmail account

For now "real email" can simply be your own mailbox sending to real addresses. It is the prod mode with Gmail as the SMTP server.
Gmail limits a personal account to about 500 recipients a day and rewrites the From address to the account's own, so use that address.

1. Turn on 2-Step Verification for the Google account, then create an **app password** (Google account > Security > App passwords). Use the
   16 characters without spaces. Never use the normal password.
2. **Auth-service** (codes and security notices). Copy `services/auth-service/.env.example` to `services/auth-service/.env` (git-ignored) and set:

   ```
   AUTH_EMAIL_MODE=prod
   AUTH_EMAIL_SMTP_HOST=smtp.gmail.com
   AUTH_EMAIL_SMTP_USER=you@gmail.com
   AUTH_EMAIL_SMTP_PASSWORD=<app password>
   AUTH_EMAIL_FROM=you@gmail.com
   AUTH_EMAIL_FROM_DOMAINS=gmail.com
   AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS=*
   ```
   Port 587 with `starttls` is the default in prod. `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS=*` is required because you run outside
   `NODE_ENV=production` (it says, on purpose, that anyone may receive mail); use a comma list of domains to restrict it instead.
3. **Order-service** (notification emails). Create `services/order-service/.env` (git-ignored) with:

   ```
   NOTIFICATIONS_EMAIL_SMTP_HOST=smtp.gmail.com
   NOTIFICATIONS_EMAIL_SMTP_USERNAME=you@gmail.com
   NOTIFICATIONS_EMAIL_SMTP_PASSWORD=<app password>
   NOTIFICATIONS_EMAIL_FROM=you@gmail.com
   NOTIFICATIONS_EMAIL_FROM_DOMAINS=gmail.com
   ```
   and start it with the prod profile: `.un-app.ps1 --windows --real-mail`, or `mvn spring-boot:run -Dspring-boot.run.profiles=prod`.
   (Under docker compose put the same names in `services/.env` and set `BACKEND_SPRING_PROFILES_ACTIVE=prod`.)
4. Start the services. A wrong or missing value stops the service at start-up with a message naming the variable.

Which file is which: `services/auth-service/.env(.example)` is read only by the auth-service; `services/.env(.example)` (compose) and
`services/order-service/.env` serve the order-service and executor-service. The executor sends no email. The same app password may be used
in both services. If the account is later replaced by a company domain, only these values change.

## Choosing a provider (a decision for the team, not made in code)

Any SMTP relay works with the settings above: Amazon SES, SendGrid, Postmark, Mailgun. Whichever is picked:

1. Verify the sending domain (`etpteamriya.com`), and publish **SPF**, **DKIM** and a **DMARC** record for it; without them mail lands in spam.
2. Create SMTP credentials scoped to sending only; store them in the platform's secret store and pass them as environment variables.
3. Start in the provider's sandbox with `ALLOWED_RECIPIENT_DOMAINS` set, then lift it for production.
4. Watch bounces and complaints in the provider's dashboard; the services do not process them yet.

## Tests

* auth-service: `mail.spec.ts` (mode matrix and guards), `smtp-tls.integration.spec.ts` (a real in-process TLS SMTP server with a login).
* order-service: `EmailAndGuardTest` (mode matrix, dispatcher cap/allow-list/permanent failure, and GreenMail over implicit TLS with a login).
