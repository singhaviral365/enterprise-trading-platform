# 01 · Real email: off by default, MailHog in `dev`, a real provider in `prod`

Status: **plan** (the MailHog removal from `docker-compose.yml` is already done, see section 1).
Scope: auth-service (NestJS) and order-service (Spring Boot). The executor-service sends no email.

## 1. Done already: MailHog is no longer part of the compose file

MailHog is a developer tool you run on your own Windows machine, so it does not belong in the stack definition.

| Change | File |
|---|---|
| Removed the `mailhog` service (and its `dev-mail` profile) | `services/docker-compose.yml` |
| Auth-service SMTP host default `mailhog` -> `localhost`; comments now say "MailHog runs on your machine" | `services/docker-compose.yml` |
| `--mail` no longer starts a container; it only runs the order-service with the `dev` profile (MailHog must already be running) | `run-app.ps1` |
| Deleted the "MailHog (docker)" run configuration, and the "OrderService (dev + MailHog)" one no longer depends on it | `.run/` |
| Wording only: no more `docker compose --profile dev-mail ...` | `services/.env.example`, `frontend/.env.e2e.example`, `application-dev.properties`, `AUTH-OTP.md`, `NOTIFICATIONS.md` |

Not changed on purpose: the e2e tests still read codes from MailHog's web UI (`E2E_MAILHOG_URL`, default
`http://localhost:8025`), which works the same when MailHog runs natively.

Caveat for the containerised auth-service: inside a container `localhost` is the container itself. To reach MailHog on
the Windows host, set `AUTH_EMAIL_SMTP_HOST=host.docker.internal`. The start-up guard only accepts
`localhost / 127.0.0.1 / ::1 / mailhog`, so add `host.docker.internal` to `LOCAL_SMTP_HOSTS` (auth-service) and
`LOCAL_HOSTS` (order-service) as part of step 3.1 / 3.2. Most people run the services from the IDE, where `localhost` works.

## 2. What exists today (and what the plan keeps)

Both services already hide email behind an interface, so this is an extension, not a rewrite.

| | auth-service | order-service |
|---|---|---|
| Interface | `EmailSender` (`mail/email-sender.ts`, token `EMAIL_SENDER`): `enabled()`, `send(to, subject, body)` | `EmailSender`: `enabled()`, `send(to, subject, body)` |
| Off | `DisabledEmailSender` | `DisabledEmailSender` (deliveries recorded as `SKIPPED`) |
| Dev | `SmtpEmailSender` -> nodemailer, plain SMTP, no TLS, no auth | `MailHogEmailSender` -> `JavaMailSenderImpl`, plain SMTP |
| Switch | `AUTH_EMAIL_ENABLED=true` | `notifications.email.enabled=true` + `dev` profile |
| Guard | `assertMailIsDevOnly`: refuses start in `production/prod/staging` or with a non-local host | `DevOnlyEmailGuard`: refuses start outside `dev/local`, in `prod/production/staging`, or with a non-local host |
| Callers | registration, login 2FA, password reset, account-security (OTP codes) | `EmailDispatcher` (outbox of notification deliveries: batch, retries, max attempts) |

Both guards are deliberately hard-wired to "development only". Real email therefore needs the guards re-shaped, not
bypassed: they should enforce the right rules for each mode instead of one rule that forbids production.

## 3. Target: three modes

| Mode | Purpose | Sender | Guard rules |
|---|---|---|---|
| **off** (default) | Nothing is sent; every other environment | `DisabledEmailSender` | Nothing to check. Any SMTP variable present while the mode is `off` is ignored (log one line saying so) |
| **dev** | See mails locally without delivering them | SMTP to MailHog, no TLS, no auth | Host must be local; refuse if `NODE_ENV=production` / a `prod` profile is active |
| **prod** | Deliver to real addresses | SMTP to a real provider over TLS with authentication | Host must **not** be local; TLS required; username/password present; `from` address on a configured domain; refuse if the `dev` profile is also active |

The mode is selected explicitly and independently of whether the process is "production-like". That matters because the
compose stack runs `NODE_ENV=production` for the auth-service, and a test deployment may legitimately want real mail.

### 3.0 Naming (same idea in both services)

| | auth-service (env) | order-service (property / env) |
|---|---|---|
| Mode | `AUTH_EMAIL_MODE=off|dev|prod` (default `off`; `AUTH_EMAIL_ENABLED=true` kept as an alias for `dev` for one release, then removed) | Spring profiles: none = off, `dev`, `prod`; plus `notifications.email.enabled` must be `true` in those profiles |
| Host / port | `AUTH_EMAIL_SMTP_HOST`, `AUTH_EMAIL_SMTP_PORT` | `notifications.email.smtp.host/port` |
| TLS | `AUTH_EMAIL_SMTP_TLS=starttls|implicit|none` (`prod` requires `starttls` or `implicit`) | `notifications.email.smtp.tls=starttls|implicit|none` |
| Credentials | `AUTH_EMAIL_SMTP_USER`, `AUTH_EMAIL_SMTP_PASSWORD` | `notifications.email.smtp.username/password` (env: `NOTIFICATIONS_EMAIL_SMTP_USERNAME/PASSWORD`) |
| Sender | `AUTH_EMAIL_FROM` | `notifications.email.from` |
| Safety net | `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS` (comma list; empty = no restriction, only allowed in `prod` with `NODE_ENV=production`) | `notifications.email.allowed-recipient-domains` |

The recipient allow-list is the guard rail for **non-production deployments that use the `prod` mode** (staging, a demo):
mail only goes to addresses on those domains (for example your own), everything else is recorded as `SKIPPED` / refused
with a clear log line. It prevents the classic "staging mailed 10,000 real customers" accident.

## 4. auth-service (NestJS) plan

### 4.1 Code
1. `mail/mail.config.ts`: replace `assertMailIsDevOnly` with `assertMailSettings(settings, env)` that applies the table in
   section 3 per mode. Settings gain `mode`, `tls`, `user`, `password`, `allowedRecipientDomains`.
2. Keep `SmtpEmailSender` for dev, and add a provider sender next to it (suggested name `ProviderEmailSender`, same
   `EmailSender` interface), or generalise `SmtpEmailSender` to read TLS and auth from settings. Preferred: **one class**,
   because nodemailer already covers both; the difference is settings:
   - `secure: tls === 'implicit'`, `requireTLS: tls === 'starttls'`, `auth: { user, pass }` when present.
   - `tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }` in `prod` (never turn certificate checking off).
   - `pool: true`, `maxConnections` small (3-5), `rateLimit`/`rateDelta` to stay under the provider's quota.
   - Timeouts as today (5 s connect/greeting, 10 s socket).
3. `mail.module.ts`: factory chooses by `mode`; `off` -> `DisabledEmailSender`.
4. Recipient allow-list check inside `send` (throws a typed error, so callers treat it as "not deliverable").
5. Never log the body (it contains one-time codes) or the SMTP password. Log provider response codes and message ids only.
6. Add `host.docker.internal` to the local hosts accepted in `dev` (section 1 caveat).

### 4.2 Message content (needed for real delivery, not for MailHog)
- Send **multipart**: plain text (today's body) **and** a small HTML version. The `EmailSender` signature
  `send(to, subject, body)` stays; add an optional `html?: string` parameter (default undefined) so existing callers do not change.
- Subjects are already single-line; keep that rule.
- Add `Reply-To` (optional env) and a `List-Unsubscribe` header **only** for notification mail (order-service), never for OTP mail.

### 4.3 Tests
- Unit: guard table (every mode x environment combination, including the error text), settings parsing, allow-list.
- Unit: nodemailer transport options for each mode (assert the options object passed to `createTransport`; no network).
- Integration (optional, recommended): `smtp-server` (npm, dev dependency) as an in-process SMTP server that requires
  STARTTLS + AUTH, to prove the `prod` path really negotiates TLS and authenticates, with no real mail sent.
- Existing `mail.spec.ts` and `otp.config.spec.ts` are extended; coverage thresholds (90/85) must stay green.

## 5. order-service (Spring Boot) plan

### 5.1 Code
1. Rename `MailHogEmailSender` -> `SmtpEmailSender` (it is no longer MailHog-only). Build `JavaMailSenderImpl` with
   `username/password` when present and JavaMail properties:
   `mail.smtp.auth=true`, `mail.smtp.starttls.enable=true`, `mail.smtp.starttls.required=true`,
   `mail.smtp.ssl.checkserveridentity=true`, `mail.smtp.ssl.protocols=TLSv1.2 TLSv1.3`, connect/read/write timeouts.
   Keep building the sender by hand (not Spring Boot's mail auto-config) so nothing else can pick up an SMTP server.
2. Replace `DevOnlyEmailGuard` with `EmailEnvironmentGuard` implementing section 3:
   - `dev` active -> local host only, no `prod` profile (as today).
   - `prod` active -> non-local host, `tls != none`, username and password non-blank, `from` domain in
     `notifications.email.from-domains`, and `dev` not active.
   - neither active and `enabled=true` -> fail ("email needs the dev or prod profile").
3. `application-prod.properties` (new): `notifications.email.enabled=true`, port `587`, `tls=starttls`; host/credentials
   **only from environment variables**, no values in the file.
4. `EmailDispatcher` already batches, retries and gives up after `max-attempts`: keep it, and add
   - a **per-minute send cap** (`notifications.email.dispatch.max-per-minute`) to respect provider limits,
   - classification of failures: permanent (invalid address, 5xx) -> mark `FAILED` immediately and do not retry;
     transient (4xx, timeouts) -> retry with backoff (today: fixed interval),
   - the allow-list check before sending (record `SKIPPED` with reason `RECIPIENT_NOT_ALLOWED`).
5. `EmailSender.enabled()` stays the single switch callers use, so no notification code changes.

### 5.2 Tests
- Replace `EmailAndGuardTest` cases with the mode matrix. Add a GreenMail (`com.icegreen:greenmail-junit5`) test with
  STARTTLS + auth to cover the prod path end to end, in-process, no network.
- Keep the "default profile sends nothing and records SKIPPED" test: it is the most important safety test.

## 6. Provider choice and DNS (decision needed)

SMTP is enough for the first version because both services already speak it. Options, in order of effort:

| Option | Notes |
|---|---|
| **Amazon SES / SendGrid / Postmark / Mailgun over SMTP** (recommended start) | Per-provider SMTP credentials, port 587 STARTTLS, free or cheap tiers, bounce webhooks later |
| Gmail / Google Workspace SMTP relay | Fine for a demo with your own address; low daily limits, app passwords needed, not for real traffic |
| Provider HTTP API (SES SDK, SendGrid API) | Better throughput and bounce data; a different `EmailSender` implementation, same interface. Later |

For real delivery to inboxes (not spam) the sending **domain** needs SPF, DKIM and DMARC records, and the `From` address must
be on that domain (today's `noreply@etpteamriya.com` is only a placeholder). This is an infrastructure task for whoever
owns DNS; the code cannot work around it.

## 7. Secrets and configuration
- SMTP credentials come from environment variables / a secret store, never from committed files. `services/.env.example`
  gets the new variable **names** with empty values.
- `docker-compose.yml`: pass `AUTH_EMAIL_MODE`, `AUTH_EMAIL_SMTP_*`, and for the order-service
  `NOTIFICATIONS_EMAIL_SMTP_*` through, all defaulting to empty/`off`.

## 8. Rollout order
1. Extend the guards and settings with the three modes (no behaviour change: default stays `off`). Ship.
2. Add TLS/auth to the sender and the in-process SMTP tests. Ship (still `off` everywhere except dev).
3. Pick a provider, verify the domain (DNS), create credentials.
4. Turn on `prod` mode in a staging deployment **with the recipient allow-list**, send to your own address, check headers
   (SPF/DKIM pass) and the spam folder.
5. Remove the allow-list requirement only for the real production deployment.

## 9. Acceptance criteria
- With no configuration, neither service sends mail and nothing fails (unchanged).
- `dev` + MailHog on Windows: codes and notification emails appear in MailHog exactly as today.
- `prod` + provider credentials: an OTP mail and a notification mail arrive in a real inbox, over verified TLS.
- A misconfiguration (prod mode with `localhost`, dev mode with a real host, prod without credentials or TLS) stops the
  service at start-up with an explicit message.
- Logs never contain codes, message bodies or SMTP passwords.

## 10. Open questions
1. Which provider (section 6) and which sending domain?
2. Should failed OTP sends be surfaced to the user ("we could not send the code") or kept generic, as now, to avoid user enumeration? (Recommendation: keep generic.)
3. Do notification emails need an unsubscribe link now, or is the in-app preference (already in Settings) enough for the first release?
